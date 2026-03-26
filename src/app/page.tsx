import Link from 'next/link';
import { ArrowRight, Sparkles, MousePointerClick, Wand2, Globe } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="gradient-text">Custom</span>
            <span className="text-white">WebService</span>
          </h1>
          <nav className="flex items-center gap-5">
            <Link
              href="/catalog"
              className="hidden text-sm text-slate-400 transition-colors hover:text-white sm:block"
            >
              API 카탈로그
            </Link>
            <Link href="/login" className="btn-primary text-sm">
              시작하기
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
        {/* Background orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-cyan-500/[0.07] blur-[100px]" />
          <div className="absolute -right-32 bottom-1/4 h-96 w-96 rounded-full bg-violet-500/[0.07] blur-[100px]" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/[0.05] blur-[80px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="animate-fade-in-up">
            <span className="badge mb-6 inline-flex items-center gap-1.5 border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
              <Sparkles className="h-3 w-3" />
              54개 무료 API · AI 자동 생성
            </span>
          </div>

          <h2 className="animate-fade-in-up-delay-1 text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-6xl">
            코딩 없이 만드는
            <br />
            <span className="gradient-text">나만의 웹서비스</span>
          </h2>

          <p className="animate-fade-in-up-delay-2 mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
            원하는 API를 골라 담고, 어떤 서비스를 만들고 싶은지 설명하세요.
            <br className="hidden sm:block" />
            AI가 자동으로 만들어 바로 게시합니다. 모든 것이 무료.
          </p>

          <div className="animate-fade-in-up-delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/builder"
              className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-base"
            >
              무료로 시작하기
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/catalog"
              className="btn-secondary inline-flex items-center gap-2 px-8 py-4 text-base"
            >
              API 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* 3-Step Guide */}
      <section className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
              How it works
            </h3>
            <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">3단계로 완성</p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            <StepCard
              step={1}
              icon={<MousePointerClick className="h-6 w-6" />}
              title="API 선택"
              description="날씨, 환율, 뉴스 등 54개 무료 API 중 원하는 것을 골라 담으세요"
              delay="animate-fade-in-up"
            />
            <StepCard
              step={2}
              icon={<Wand2 className="h-6 w-6" />}
              title="서비스 설명"
              description="어떤 서비스를 만들고 싶은지 자연어로 설명해주세요"
              delay="animate-fade-in-up-delay-1"
            />
            <StepCard
              step={3}
              icon={<Globe className="h-6 w-6" />}
              title="자동 생성 & 게시"
              description="AI가 코드를 생성하고 서브도메인으로 즉시 게시합니다"
              delay="animate-fade-in-up-delay-2"
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function StepCard({
  step,
  icon,
  title,
  description,
  delay,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: string;
}) {
  return (
    <div className={`card group p-8 ${delay}`}>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-cyan-400">
          {icon}
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Step {step}
        </span>
      </div>
      <h4 className="text-lg font-bold text-white">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}
