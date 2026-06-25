import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { toSlug, isValidSlug } from '@/lib/utils/slugify';
import { logger } from '@/lib/utils/logger';

export interface SlugSuggestInput {
  context: string;           // 사용자 입력 서비스 설명
  pageTitle?: string;        // 생성된 HTML의 <title> (힌트)
  categoryHints?: string[];  // 선택된 API 카테고리
}

const SLUG_SYSTEM_PROMPT = `You are a URL slug generator for web services.
Given a service description, generate exactly 3 English kebab-case URL slugs.
Rules:
- Each slug must be 3–40 characters long
- Only lowercase letters (a-z), digits (0-9), and hyphens (-)
- Must start and end with a letter or digit (no leading/trailing hyphens)
- Do not use reserved words like: admin, dashboard, login, api, www, auth, settings, profile, help, support, blog, docs, status, health
- Each slug must be unique and reflect the service content
- Return ONLY a raw JSON array, no markdown, no code blocks, no explanation
Example output: ["my-weather-app", "weather-dashboard", "daily-forecast"]`;

function buildUserPrompt(input: SlugSuggestInput): string {
  const userParts: string[] = [`Service description: ${input.context}`];
  if (input.pageTitle) {
    userParts.push(`Page title: ${input.pageTitle}`);
  }
  if (input.categoryHints && input.categoryHints.length > 0) {
    userParts.push(`Categories: ${input.categoryHints.join(', ')}`);
  }
  userParts.push('\nReturn a JSON array of exactly 3 slug suggestions.');
  return userParts.join('\n');
}

/**
 * AI 응답 본문에서 JSON 배열을 추출한다. 미발견/파싱 실패 시 null(폴백 트리거).
 * 첫 `[`부터 그 뒤 첫 `]`까지를 후보로 삼는다. 정규식(`/\[[\s\S]*?\]/`) 대신
 * 문자열 indexOf를 쓰는 이유: 백트래킹이 없어 super-linear(ReDoS) 위험이 없고 O(n)이다.
 */
function extractJsonArray(content: string): unknown[] | null {
  const start = content.indexOf('[');
  const end = start === -1 ? -1 : content.indexOf(']', start);
  if (start === -1 || end === -1) {
    logger.warn('slugSuggester: could not find JSON array in AI response', {
      content: content.slice(0, 200),
    });
    return null;
  }
  const candidate = content.slice(start, end + 1);
  try {
    const raw: unknown = JSON.parse(candidate);
    if (!Array.isArray(raw)) throw new Error('Not an array');
    return raw;
  } catch {
    logger.warn('slugSuggester: JSON parse failed', { raw: candidate.slice(0, 200) });
    return null;
  }
}

/** 후보를 정규화·검증·중복 제거해 최대 `limit`개의 유효 slug로 만든다. */
function normalizeUniqueSlugs(parsed: unknown[], limit = 3): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of parsed) {
    if (result.length >= limit) break;
    const normalized = toSlug(String(item)).slice(0, 50);
    if (!normalized || !isValidSlug(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** AI 영문 slug 후보 최대 3개. 실패 시 빈 배열(폴백 트리거) */
export async function suggestSlugs(input: SlugSuggestInput): Promise<string[]> {
  try {
    const provider = AiProviderFactory.createForTask('suggestion');

    const aiResponse = await provider.generateCode({
      system: SLUG_SYSTEM_PROMPT,
      user: buildUserPrompt(input),
      temperature: 0.7,
      maxTokens: 200,
    });

    const parsed = extractJsonArray(aiResponse.content);
    if (!parsed) return [];

    return normalizeUniqueSlugs(parsed);
  } catch (err) {
    logger.warn('slugSuggester: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
