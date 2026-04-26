'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, CheckCircle2, XCircle, Lightbulb, Zap, Globe, Code2, Palette, ShieldCheck } from 'lucide-react';

type GenerationStatus = 'idle' | 'generating' | 'completed' | 'failed';

interface GenerationProgressProps {
  status: GenerationStatus;
  progress: number;
  currentStep: string;
  error: string | null;
  selectedApiCount: number;
  onGenerate: () => void;
  onRetry: () => void;
  onNavigateDashboard: () => void;
}

/* ─── 대기 중 표시할 팁 & 정보 ─── */
const TIPS: { icon: typeof Lightbulb; text: string; category: string }[] = [
  { icon: Lightbulb, text: '생성된 서비스는 대시보드에서 언제든 수정할 수 있어요.', category: '팁' },
  { icon: Zap, text: 'AI가 API 응답 구조를 분석하여 최적의 UI를 설계하고 있어요.', category: '진행 중' },
  { icon: Globe, text: '생성 후 서브도메인으로 즉시 게시할 수 있어요.', category: '팁' },
  { icon: Code2, text: 'HTML, CSS, JavaScript를 조합해 완전한 웹페이지를 만들고 있어요.', category: '진행 중' },
  { icon: Palette, text: '서비스 성격에 맞는 색상 테마와 레이아웃을 선택하고 있어요.', category: '진행 중' },
  { icon: ShieldCheck, text: '생성된 코드는 XSS, API 키 노출 등 보안 검사를 거쳐요.', category: '안전' },
  { icon: Lightbulb, text: '수정 요청으로 디자인, 기능, 레이아웃을 자유롭게 바꿀 수 있어요.', category: '팁' },
  { icon: Zap, text: '20개 이상의 실제 같은 목 데이터로 바로 미리보기가 가능해요.', category: '진행 중' },
  { icon: Globe, text: '반응형으로 제작되어 모바일, 태블릿, 데스크톱 모두 지원해요.', category: '팁' },
  { icon: Code2, text: 'Chart.js를 활용한 인터랙티브 데이터 시각화가 포함돼요.', category: '진행 중' },
  { icon: Palette, text: '검색, 필터, 정렬 등 실제로 동작하는 기능을 구현하고 있어요.', category: '진행 중' },
  { icon: Lightbulb, text: '여러 API를 조합하면 더 풍부한 서비스를 만들 수 있어요.', category: '팁' },
];

/* ─── 생성 단계별 안내 메시지 ─── */
const PHASE_INFO: Record<string, { label: string; detail: string }> = {
  analyzing: { label: 'API 분석', detail: '선택된 API의 엔드포인트와 데이터 구조를 파악하고 있어요' },
  generating_code: { label: '코드 생성', detail: 'AI가 서비스에 맞는 HTML, CSS, JavaScript를 작성하고 있어요' },
  styling: { label: '디자인 적용', detail: '레이아웃, 색상, 타이포그래피를 다듬고 있어요' },
  validating: { label: '보안 검증', detail: '생성된 코드의 안전성을 최종 점검하고 있어요' },
};

function useRotatingTip(isActive: boolean) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isActive]);

  return TIPS[index];
}

function useElapsedTime(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  return elapsed;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
}

/* ─── 플로팅 파티클 애니메이션 ─── */
function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-20"
          style={{
            width: `${6 + i * 3}px`,
            height: `${6 + i * 3}px`,
            background: 'var(--accent-primary)',
            left: `${15 + i * 14}%`,
            animation: `float-particle ${3 + i * 0.7}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── 단계 표시 인디케이터 ─── */
function StepIndicator({ currentStep, progress }: { currentStep: string; progress: number }) {
  const steps = ['analyzing', 'generating_code', 'styling', 'validating'];
  const stepLabels = ['분석', '생성', '디자인', '검증'];

  const getStepStatus = useCallback(
    (step: string) => {
      const stepIndex = steps.indexOf(step);
      const currentIndex = steps.indexOf(currentStep);
      if (currentIndex === -1) {
        if (progress < 10) return 'pending';
        if (progress < 85) return step === 'generating_code' ? 'active' : stepIndex < 1 ? 'done' : 'pending';
        if (progress < 90) return stepIndex < 2 ? 'done' : step === 'styling' ? 'active' : 'pending';
        return stepIndex < 3 ? 'done' : step === 'validating' ? 'active' : 'pending';
      }
      if (stepIndex < currentIndex) return 'done';
      if (stepIndex === currentIndex) return 'active';
      return 'pending';
    },
    [currentStep, progress]
  );

  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((step, i) => {
        const s = getStepStatus(step);
        return (
          <div key={step} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-500"
                style={{
                  background:
                    s === 'done'
                      ? 'var(--success)'
                      : s === 'active'
                        ? 'var(--accent-primary)'
                        : 'var(--bg-surface)',
                  color:
                    s === 'done' || s === 'active'
                      ? '#fff'
                      : 'var(--text-muted)',
                  boxShadow:
                    s === 'active' ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
                }}
              >
                {s === 'done' ? '✓' : i + 1}
              </div>
              <span
                className="mt-1 text-[10px] font-medium transition-colors duration-300"
                style={{
                  color: s === 'active' ? 'var(--accent-primary)' : s === 'done' ? 'var(--success)' : 'var(--text-muted)',
                }}
              >
                {stepLabels[i]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mb-4 h-0.5 w-8 rounded-full transition-all duration-500"
                style={{
                  background: s === 'done' ? 'var(--success)' : 'var(--bg-surface)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GenerationProgress({
  status,
  progress,
  currentStep,
  error,
  selectedApiCount,
  onGenerate,
  onRetry,
  onNavigateDashboard,
}: GenerationProgressProps) {
  const tip = useRotatingTip(status === 'generating');
  const elapsed = useElapsedTime(status === 'generating');

  // currentStep에서 step 이름 추출 (백엔드 SSE의 step 필드)
  const stepKey = currentStep.includes('분석')
    ? 'analyzing'
    : currentStep.includes('생성')
      ? 'generating_code'
      : currentStep.includes('디자인') || currentStep.includes('적용')
        ? 'styling'
        : currentStep.includes('검증')
          ? 'validating'
          : 'generating_code';

  const phaseInfo = PHASE_INFO[stepKey];
  const TipIcon = tip.icon;

  if (status === 'idle') {
    return (
      <div className="card p-10 text-center">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'var(--grad-subtle)' }}
        >
          <Sparkles className="h-7 w-7" style={{ color: 'var(--accent-primary)' }} />
        </div>
        <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>준비 완료!</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          선택한 {selectedApiCount}개의 API와 입력한 설명을 바탕으로
          <br />
          웹서비스를 자동 생성합니다.
        </p>
        <button
          type="button"
          onClick={onGenerate}
          className="btn-primary mt-8 inline-flex items-center gap-2 px-8 py-3"
        >
          <Sparkles className="h-4 w-4" />
          생성하기
        </button>
      </div>
    );
  }

  if (status === 'generating') {
    return (
      <div className="card relative overflow-hidden p-8">
        {/* 플로팅 파티클 배경 */}
        <FloatingParticles />

        <div className="relative z-10">
          {/* 단계 인디케이터 */}
          <StepIndicator currentStep={stepKey} progress={progress} />

          {/* 메인 진행 영역 */}
          <div className="mt-6 text-center">
            <div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'var(--accent-light)' }}
            >
              <Loader2
                className="h-6 w-6 animate-spin"
                style={{ color: 'var(--accent-primary)' }}
              />
            </div>

            <p
              className="mt-4 text-sm font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {phaseInfo?.label || '처리 중'}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--text-secondary)' }}
            >
              {phaseInfo?.detail || currentStep}
            </p>
          </div>

          {/* 프로그레스 바 */}
          <div className="mx-auto mt-5 max-w-xs">
            <div
              className="h-2 overflow-hidden rounded-full"
              style={{ background: 'var(--bg-surface)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${progress}%`,
                  background: 'var(--grad-primary)',
                  boxShadow: '0 0 8px rgba(99,102,241,0.3)',
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>{progress}%</span>
              <span>{formatTime(elapsed)} 경과</span>
            </div>
          </div>

          {/* 구분선 */}
          <div className="mx-auto my-5 max-w-xs border-t" style={{ borderColor: 'var(--border-subtle)' }} />

          {/* 회전 팁 */}
          <div
            className="mx-auto flex max-w-sm items-start gap-3 rounded-xl p-3 transition-all duration-500"
            style={{ background: 'var(--bg-elevated)' }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'var(--grad-subtle)' }}
            >
              <TipIcon className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="min-w-0">
              <span
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: 'var(--accent-primary)' }}
              >
                {tip.category}
              </span>
              <p
                className="mt-0.5 text-xs leading-relaxed transition-opacity duration-500"
                style={{ color: 'var(--text-secondary)' }}
              >
                {tip.text}
              </p>
            </div>
          </div>
        </div>

        {/* 파티클 애니메이션 키프레임 */}
        <style>{`
          @keyframes float-particle {
            0%, 100% { transform: translateY(100%) scale(0); opacity: 0; }
            20% { opacity: 0.2; transform: translateY(60%) scale(1); }
            80% { opacity: 0.15; transform: translateY(-20%) scale(0.8); }
            100% { transform: translateY(-40%) scale(0); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div className="card p-10 text-center" style={{ borderColor: 'rgba(16,185,129,0.25)' }}>
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(16,185,129,0.12)' }}
        >
          <CheckCircle2 className="h-7 w-7" style={{ color: '#059669' }} />
        </div>
        <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>생성 완료!</h3>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>웹서비스가 성공적으로 생성되었습니다.</p>
        <button
          type="button"
          onClick={onNavigateDashboard}
          className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
          }}
        >
          대시보드에서 확인하기
        </button>
      </div>
    );
  }

  // status === 'failed'
  return (
    <div className="card p-10 text-center" style={{ borderColor: 'rgba(225,29,72,0.25)' }}>
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ background: 'rgba(225,29,72,0.10)' }}
      >
        <XCircle className="h-7 w-7" style={{ color: '#e11d48' }} />
      </div>
      <h3 className="mt-5 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>생성 실패</h3>
      <p className="mt-2 text-sm" style={{ color: '#e11d48' }}>{error}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-8 inline-flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-semibold text-white transition-all hover:shadow-lg"
        style={{
          background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
          boxShadow: '0 2px 8px rgba(225,29,72,0.25)',
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
