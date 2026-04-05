import '@/lib/events/init';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { CatalogService } from '@/services/catalogService';
import { AuthService } from '@/services/authService';
import { RateLimitService } from '@/services/rateLimitService';
import { CodeRepository } from '@/repositories/codeRepository';
import { EventRepository } from '@/repositories/eventRepository';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import type { IAiProvider } from '@/providers/ai/IAiProvider';
import type { DesignPreferences } from '@/types/project';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode, assembleHtml } from '@/lib/ai/codeParser';
import { runFastQc, runDeepQc, isQcEnabled } from '@/lib/qc';
import { validateAll, evaluateQuality } from '@/lib/ai/codeValidator';
import { inferDesignFromCategories } from '@/lib/ai/categoryDesignMap';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from '@/lib/ai/qualityLoop';
import { isExternalAvailable } from '@/lib/events/webhookForwarder';
import { eventBus } from '@/lib/events/eventBus';
import { getLimits } from '@/lib/config/features';
import { getCorrelationId } from '@/lib/utils/correlationId';
import {
  AuthRequiredError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// 2.2 — Safe wrapper: assembleHtml() can throw (e.g. malformed parsed output)
function safeAssembleHtml(code: { html: string; css: string; js: string }): string | null {
  try {
    return assembleHtml(code);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const authService = new AuthService(supabase);
    const user = await authService.getCurrentUser();
    if (!user) throw new AuthRequiredError();

    // Validate request body
    let projectId: string;
    try {
      const body = await request.json();
      if (typeof body.projectId !== 'string' || !body.projectId) {
        throw new ValidationError('projectId는 필수 항목입니다.');
      }
      projectId = body.projectId;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Atomically check AND increment the daily counter before opening the SSE stream.
    // Uses a DB-level test-and-set (UPDATE WHERE count < limit) to eliminate the
    // race condition window that existed with the previous SELECT COUNT approach.
    // Call rateLimitService.decrementDailyLimit() in the failure path to compensate.
    const correlationId = getCorrelationId(request);
    const serviceSupabase = await createServiceClient();
    const eventRepo = new EventRepository(serviceSupabase);

    const rateLimitService = new RateLimitService(supabase);
    await rateLimitService.checkAndIncrementDailyLimit(user.id);

    // 병렬 DB 조회: 프로젝트 정보 + API ID를 동시에 가져옴
    const projectService = new ProjectService(supabase);
    const [project, apiIds] = await Promise.all([
      projectService.getById(projectId, user.id),
      projectService.getProjectApiIds(projectId),
    ]);

    if (apiIds.length === 0) {
      throw new ValidationError('프로젝트에 연결된 API가 없습니다.');
    }

    const catalogService = new CatalogService(supabase);
    const apis = await catalogService.getByIds(apiIds);
    if (apis.length === 0) {
      throw new ValidationError('선택된 API 정보를 찾을 수 없습니다.');
    }

    // Build prompt (시스템 프롬프트는 모듈 레벨 캐시 사용)
    const systemPrompt = buildSystemPrompt();
    const designPreferences = (project.metadata as Record<string, unknown>)?.designPreferences as DesignPreferences | undefined;
    const userPrompt = buildUserPrompt(apis, project.context, project.id, designPreferences);
    const limits = getLimits();

    // SSE stream with proper cancellation handling
    const encoder = new TextEncoder();
    let isCancelled = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (isCancelled) return;
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          } catch {
            isCancelled = true;
          }
        };

        // H6: Declare provider outside try so the catch block can read provider.name
        let provider: IAiProvider | undefined;

        try {
          send('progress', {
            step: 'analyzing',
            progress: 5,
            message: 'API 분석 중...',
          });

          try {
            provider = AiProviderFactory.createForTask('generation');
          } catch (factoryErr) {
            throw new Error(
              `AI 서비스 초기화 실패: ${factoryErr instanceof Error ? factoryErr.message : 'Unknown'}`
            );
          }

          send('progress', {
            step: 'generating_code',
            progress: 10,
            message: '코드 생성 시작...',
          });

          // AI 스트리밍 생성 — 실시간 진행률 전송 (타임아웃 없음: 스트리밍 중
          // 사용자가 진행 상황을 확인 가능하며, 브라우저 종료 시 SSE cancel()로 자동 정리)
          let lastProgressUpdate = Date.now();
          const streamStartTime = Date.now();

          const response = await provider.generateCodeStream(
            { system: systemPrompt, user: userPrompt },
            (_chunk: string, accumulated: string) => {
              if (isCancelled) return;

              // 500ms마다 진행률 업데이트 (너무 자주 보내지 않음)
              const now = Date.now();
              if (now - lastProgressUpdate < 500) return;
              lastProgressUpdate = now;

              // 실시간 진행률: 누적 길이 기반 추정 (10% ~ 80%)
              const estimatedProgress = Math.min(
                80,
                10 + Math.floor((accumulated.length / 15000) * 70)
              );
              const elapsed = Math.floor((now - streamStartTime) / 1000);

              send('progress', {
                step: 'generating_code',
                progress: estimatedProgress,
                message: `코드 생성 중... (${elapsed}초 경과, ${(accumulated.length / 1024).toFixed(1)}KB)`,
              });
            },
          );

          if (isCancelled) return;

          send('progress', {
            step: 'styling',
            progress: 85,
            message: '디자인 적용 중...',
          });

          let parsed = parseGeneratedCode(response.content);

          send('progress', {
            step: 'validating',
            progress: 90,
            message: '코드 검증 중...',
          });

          const validation = validateAll(parsed.html, parsed.css, parsed.js);

          if (validation.errors.length > 0) {
            logger.warn('Generated code failed security validation', {
              projectId,
              errors: validation.errors,
            });
            throw new Error(`생성된 코드에 보안 문제가 감지되었습니다: ${validation.errors.join(', ')}`);
          }

          let quality = evaluateQuality(parsed.html, parsed.css, parsed.js);

          // 렌더링 QC (Fast — 인라인, 3초 제한)
          let qcReport: import('@/types/qc').QcReport | null = null;
          if (isQcEnabled()) {
            const assembledForFastQc = safeAssembleHtml(parsed);
            if (!assembledForFastQc) {
              logger.warn('safeAssembleHtml returned null for Fast QC, skipping', { projectId });
            }
            try {
              qcReport = assembledForFastQc ? await runFastQc(assembledForFastQc) : null;
              if (qcReport) {
                logger.info('Fast QC completed', {
                  projectId,
                  qcScore: qcReport.overallScore,
                  qcPassed: qcReport.passed,
                });
                eventBus.emit({
                  type: 'QC_REPORT_COMPLETED',
                  payload: {
                    projectId,
                    overallScore: qcReport.overallScore,
                    passed: qcReport.passed,
                    checks: qcReport.checks.map(c => ({ name: c.name, passed: c.passed, score: c.score })),
                    isDeep: false,
                  },
                });
              }
            } catch (qcErr) {
              logger.warn('Fast QC failed, continuing without', { projectId, qcErr });
              eventBus.emit({
                type: 'QC_REPORT_FAILED',
                payload: { projectId, stage: 'fast' as const, error: qcErr instanceof Error ? qcErr.message : String(qcErr) },
              });
            }
          }

          // 외부 자동 수정 불가 시 내부 QC 강화 모드 (2.5: strictMode는 루프 내에서 매 반복마다 재평가)
          const maxRetries = !isExternalAvailable() ? 2 : 1;

          // 품질 자동 재생성
          // 2.4 — 최선 버전 추적: 재시도 중 개선→악화 시 최선 버전 유지
          let bestParsed = parsed;
          let bestQuality = quality;
          let bestQcReport = qcReport;
          let qualityLoopUsed = false;

          for (let retryAttempt = 0; retryAttempt < maxRetries; retryAttempt++) {
            // 2.5 — 매 반복마다 strictMode 재평가
            const currentStrictMode = !isExternalAvailable();
            if (!shouldRetryGeneration(bestQuality, bestQcReport, currentStrictMode)) break;

            logger.info('Quality below threshold, attempting improvement', {
              projectId,
              score: bestQuality.structuralScore,
              attempt: retryAttempt + 1,
              maxRetries,
              strictMode: currentStrictMode,
            });

            send('progress', {
              step: 'quality_improvement',
              progress: 92,
              message: '품질 개선 중...',
            });

            try {
              const improvementPrompt = buildQualityImprovementPrompt(bestParsed, bestQuality, bestQcReport);
              const retryResponse = await provider!.generateCode({ system: systemPrompt, user: improvementPrompt });
              const retryParsed = parseGeneratedCode(retryResponse.content);

              if (retryParsed.html) {
                const retryQuality = evaluateQuality(retryParsed.html, retryParsed.css, retryParsed.js);

                // 재생성 코드에 대해 Fast QC 재검증 (2.2: safeAssembleHtml 사용)
                let retryQcReport: import('@/types/qc').QcReport | null = null;
                if (isQcEnabled()) {
                  try {
                    const assembledForRetryQc = safeAssembleHtml(retryParsed);
                    if (assembledForRetryQc) {
                      retryQcReport = await runFastQc(assembledForRetryQc);
                    }
                  } catch {
                    // QC 실패해도 코드 레벨 비교는 진행
                  }
                }

                // 코드 레벨 + 렌더링 QC 모두 고려하여 채택 결정
                const codeImproved = retryQuality.structuralScore > bestQuality.structuralScore ||
                    retryQuality.mobileScore > bestQuality.mobileScore;
                const qcImproved = retryQcReport && bestQcReport
                  ? retryQcReport.overallScore > bestQcReport.overallScore
                  : false;

                // 2.4 — 개선된 경우에만 bestParsed 갱신
                if (codeImproved || qcImproved) {
                  bestParsed = retryParsed;
                  bestQuality = retryQuality;
                  if (retryQcReport) bestQcReport = retryQcReport;
                  qualityLoopUsed = true;
                }
              }
            } catch (retryErr) {
              logger.warn('Quality improvement retry failed', { projectId, retryErr });
            }
          }

          // 2.4 — 루프 종료 후 최선 버전 적용
          parsed = bestParsed;
          quality = bestQuality;
          qcReport = bestQcReport;

          const strictMode = !isExternalAvailable();

          const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
          const inference = inferDesignFromCategories(categories);

          const codeRepo = new CodeRepository(supabase);
          const nextVersion = await codeRepo.getNextVersion(projectId);

          const savedCode = await codeRepo.create({
            projectId,
            version: nextVersion,
            codeHtml: parsed.html,
            codeCss: parsed.css,
            codeJs: parsed.js,
            framework: 'vanilla',
            aiProvider: response.provider,
            aiModel: response.model,
            aiPromptUsed: userPrompt,
            generationTimeMs: response.durationMs,
            tokenUsage: response.tokensUsed,
            dependencies: [],
            metadata: {
              securityCheckPassed: validation.passed,
              validationErrors: [...validation.errors, ...validation.warnings],
              ...quality,
              apiCategories: categories,
              inferredTheme: inference.theme,
              inferredLayout: inference.layout,
              qualityLoopUsed,
              qcStrictMode: strictMode,
              ...(qcReport && {
                renderingQcScore: qcReport.overallScore,
                renderingQcPassed: qcReport.passed,
                renderingQcChecks: qcReport.checks.map(c => ({
                  name: c.name,
                  passed: c.passed,
                  score: c.score,
                  details: c.details,
                })),
              }),
            },
          } as Parameters<typeof codeRepo.create>[0]);

          // 버전 정리를 비동기로 실행 — SSE 응답을 블로킹하지 않음
          codeRepo.pruneOldVersions(projectId, limits.maxCodeVersionsPerProject).catch((pruneErr) => {
            logger.warn('Failed to prune old code versions', { projectId, pruneErr });
          });

          // 렌더링 Deep QC — 비동기 실행, 결과를 DB에 저장
          if (isQcEnabled()) {
            // 6.3 — savedCode.id를 클로저로 캡처하여 버전 불일치 방지
            const codeId = savedCode.id;
            const assembledForDeepQc = safeAssembleHtml(parsed);
            if (assembledForDeepQc) {
              runDeepQc(assembledForDeepQc).then(async (deepReport) => {
                if (deepReport) {
                  logger.info('Deep QC completed', {
                    projectId,
                    qcScore: deepReport.overallScore,
                    qcPassed: deepReport.passed,
                    checks: deepReport.checks.map(c => ({ name: c.name, passed: c.passed, score: c.score })),
                  });
                  eventBus.emit({
                    type: 'QC_REPORT_COMPLETED',
                    payload: {
                      projectId,
                      overallScore: deepReport.overallScore,
                      passed: deepReport.passed,
                      checks: deepReport.checks.map(c => ({ name: c.name, passed: c.passed, score: c.score })),
                      isDeep: true,
                    },
                  });
                  // 6.1 — codeId(savedCode.id) 직접 사용으로 findByProject() 버전 불일치 제거
                  try {
                    const serviceClient = await createServiceClient();
                    const { data: current } = await serviceClient
                      .from('generated_codes')
                      .select('metadata')
                      .eq('id', codeId)
                      .single();
                    if (current) {
                      await serviceClient
                        .from('generated_codes')
                        .update({
                          metadata: {
                            ...(current.metadata as Record<string, unknown> ?? {}),
                            renderingQcScore: deepReport.overallScore,
                            renderingQcPassed: deepReport.passed,
                            renderingQcChecks: deepReport.checks.map(c => ({
                              name: c.name,
                              passed: c.passed,
                              score: c.score,
                              details: c.details,
                            })),
                          },
                        })
                        .eq('id', codeId);
                    }
                  } catch (updateErr) {
                    logger.warn('Deep QC metadata update failed', {
                      projectId,
                      codeId,
                      error: updateErr instanceof Error ? updateErr.message : String(updateErr),
                    });
                  }
                }
              }).catch((qcErr) => {
                // 2.1 — 상세 스택 트레이스 포함
                logger.warn('Deep QC failed', { projectId, error: qcErr instanceof Error ? qcErr.stack : String(qcErr) });
                eventBus.emit({
                  type: 'QC_REPORT_FAILED',
                  payload: { projectId, stage: 'deep' as const, error: qcErr instanceof Error ? qcErr.message : String(qcErr) },
                });
              });
            } else {
              logger.warn('safeAssembleHtml returned null for Deep QC, skipping', { projectId });
            }
          }

          // C2: Compensating rollback — if status update fails after code is saved,
          // delete the orphaned code record to keep the DB consistent.
          try {
            await projectService.updateStatus(projectId, 'generated');
          } catch (updateError) {
            logger.error('Project status update failed, rolling back code record', {
              codeId: savedCode.id,
              projectId,
            });
            try {
              await codeRepo.delete(savedCode.id);
            } catch (deleteErr) {
              logger.error('Compensating rollback failed — orphaned code record', {
                codeId: savedCode.id,
                deleteErr,
              });
            }
            throw updateError;
          }

          const generatedEvent = {
            type: 'CODE_GENERATED' as const,
            payload: {
              projectId,
              version: nextVersion,
              provider: response.provider,
              durationMs: response.durationMs,
            },
          };
          eventBus.emit(generatedEvent);
          eventRepo.persistAsync(generatedEvent, { userId: user.id, projectId, correlationId });

          send('complete', {
            projectId,
            version: nextVersion,
            previewUrl: `/api/v1/preview/${projectId}`,
            ...(qcReport && {
              qcResult: {
                score: qcReport.overallScore,
                passed: qcReport.passed,
                issues: qcReport.checks
                  .filter(c => !c.passed)
                  .map(c => ({ name: c.name, details: c.details })),
              },
            }),
          });
        } catch (error) {
          logger.error('Code generation failed', {
            projectId,
            error: error instanceof Error ? error.message : 'Unknown',
          });

          // Compensate: restore the rate limit slot that was pre-incremented.
          // Best-effort — errors from decrement are logged but not re-thrown.
          await rateLimitService.decrementDailyLimit(user.id);

          const failedEvent = {
            type: 'CODE_GENERATION_FAILED' as const,
            payload: {
              projectId,
              error: error instanceof Error ? error.message : 'Unknown error',
              provider: provider?.name ?? 'unknown',
            },
          };
          eventBus.emit(failedEvent);
          eventRepo.persistAsync(failedEvent, { userId: user.id, projectId, correlationId });

          send('error', {
            message: error instanceof Error ? error.message : '코드 생성에 실패했습니다.',
          });
        } finally {
          controller.close();
        }
      },
      cancel() {
        isCancelled = true;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
