import Link from 'next/link';
import { ArrowRight, Sparkles, MousePointerClick, Wand2, Globe, Zap, Shield, RefreshCw, BarChart2, Cloud, Newspaper, Building2 } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen noise">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="glass-strong fixed left-0 right-0 top-0 z-50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="gradient-text">Custom</span>
            <span className="text-white">WebService</span>
          </h1>
          <nav className="flex items-center gap-2">
            <Link
              href="/catalog"
              className="hidden rounded-xl px-4 py-2 text-sm text-slate-400 transition-all hover:bg-white/[0.05] hover:text-white sm:block"
            >
              API 카탈로그
            </Link>
            <Link href="/login" className="btn-primary text-sm">
              무료로 시작하기
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 pt-20">
        {/* Aurora background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute -left-64 top-0 h-[700px] w-[700px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />
          <div className="animate-aurora absolute -right-64 bottom-0 h-[600px] w-[600px] rounded-full bg-violet-500/[0.07] blur-[120px]" style={{ animationDelay: '-4s' }} />
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/[0.04] blur-[100px]" />
        </div>

        {/* Dot grid */}
        <div className="pointer-events-none absolute inset-0 dot-bg opacity-40" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-in mb-8">
            <span className="badge inline-flex items-center gap-2 border border-cyan-500/20 bg-cyan-500/8 text-cyan-400">
              <Sparkles className="h-3.5 w-3.5" />
              54개 무료 API · AI 코드 자동 생성 · 즉시 게시
            </span>
          </div>

          {/* Headline */}
          <h2 className="animate-fade-in-up-delay-1 text-5xl font-extrabold leading-[1.1] tracking-tight sm:text-7xl">
            코딩 없이
            <br />
            <span className="gradient-text text-glow-cyan">나만의 웹서비스</span>
            <br />
            <span className="text-slate-300">5분만에 완성</span>
          </h2>

          <p className="animate-fade-in-up-delay-2 mx-auto mt-8 max-w-xl text-lg leading-relaxed text-slate-400">
            원하는 API를 고르고, 만들고 싶은 서비스를 설명하면
            <br className="hidden sm:block" />
            AI가 완성된 웹앱을 자동으로 만들어 게시합니다.
          </p>

          {/* CTA */}
          <div className="animate-fade-in-up-delay-3 mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/builder"
              className="btn-primary inline-flex items-center gap-2.5 px-8 py-4 text-base"
            >
              지금 바로 만들기
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/catalog"
              className="btn-secondary inline-flex items-center gap-2.5 px-8 py-4 text-base"
            >
              API 둘러보기
            </Link>
          </div>

          {/* Trust badges */}
          <div className="animate-fade-in-up-delay-4 mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-emerald-500" />
              가입 무료
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" />
              카드 등록 불필요
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-cyan-500" />
              즉시 게시·공유
            </span>
          </div>
        </div>

        {/* Floating preview cards */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <FloatingCard
            className="left-[5%] top-[22%] hidden lg:block"
            delay="0s"
            label="날씨 대시보드"
            icon={<Cloud className="h-4 w-4 text-cyan-400" />}
            value="서울 23°C"
          />
          <FloatingCard
            className="right-[5%] top-[28%] hidden lg:block"
            delay="1.5s"
            label="환율 계산기"
            icon={<BarChart2 className="h-4 w-4 text-violet-400" />}
            value="1 USD = 1,340 KRW"
          />
          <FloatingCard
            className="left-[8%] bottom-[25%] hidden xl:block"
            delay="0.8s"
            label="뉴스 피드"
            icon={<Newspaper className="h-4 w-4 text-emerald-400" />}
            value="오늘의 주요 뉴스"
          />
          <FloatingCard
            className="right-[8%] bottom-[20%] hidden xl:block"
            delay="2s"
            label="부동산 정보"
            icon={<Building2 className="h-4 w-4 text-amber-400" />}
            value="아파트 실거래가"
          />
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────── */}
      <section className="relative py-16">
        <div className="divider-gradient mb-16" />
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { value: '54+', label: '무료 API' },
              { value: '3단계', label: '간단한 생성 과정' },
              { value: '100%', label: '무료 서비스' },
            ].map((stat, i) => (
              <div key={i} className="animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="gradient-text text-4xl font-extrabold sm:text-5xl">{stat.value}</div>
                <div className="mt-2 text-sm text-slate-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="divider-gradient mt-16" />
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-violet-500/[0.04] blur-[100px]" />
        </div>

        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-500">How it works</p>
            <h3 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              단 <span className="gradient-text">3단계</span>로 완성
            </h3>
            <p className="mx-auto mt-4 max-w-md text-slate-400">
              복잡한 설정 없이 누구나 쉽게 자신만의 웹서비스를 만들 수 있습니다.
            </p>
          </div>

          <div className="mt-20 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: 1,
                icon: <MousePointerClick className="h-7 w-7" />,
                color: 'from-cyan-500/20 to-cyan-500/5',
                iconColor: 'text-cyan-400',
                title: 'API 선택',
                description: '날씨, 환율, 뉴스, 부동산, 교통 등 54개 무료 API 중에서 원하는 것을 골라 담으세요. 카테고리별로 정리되어 있어 찾기 쉽습니다.',
              },
              {
                step: 2,
                icon: <Wand2 className="h-7 w-7" />,
                color: 'from-violet-500/20 to-violet-500/5',
                iconColor: 'text-violet-400',
                title: '서비스 설명',
                description: '"오늘 날씨와 대기질을 한눈에 보고 싶어요"처럼 자연어로 설명하면 됩니다. AI가 최적의 서비스 구성을 알아서 제안합니다.',
              },
              {
                step: 3,
                icon: <Globe className="h-7 w-7" />,
                color: 'from-emerald-500/20 to-emerald-500/5',
                iconColor: 'text-emerald-400',
                title: '자동 생성 & 게시',
                description: 'AI가 30초 내에 완성된 웹앱을 생성하고 고유 주소로 즉시 게시합니다. 링크를 공유하면 누구나 바로 사용할 수 있습니다.',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="card-glow card group relative overflow-hidden p-8"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {/* Step connector line */}
                {i < 2 && (
                  <div className="absolute right-0 top-1/3 hidden w-6 -translate-y-1/2 sm:block">
                    <div className="h-px w-full" style={{ background: 'var(--grad-primary)', opacity: 0.3 }} />
                  </div>
                )}
                <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} ${item.iconColor} transition-transform duration-300 group-hover:scale-110`}>
                  {item.icon}
                </div>
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-600">Step {item.step}</span>
                </div>
                <h4 className="text-xl font-bold text-white">{item.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section className="relative py-24">
        <div className="divider-gradient mb-24" />
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400">Features</p>
            <h3 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
              왜 <span className="gradient-text">CustomWebService</span>인가요?
            </h3>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Zap className="h-5 w-5" />, color: 'text-amber-400 bg-amber-400/10', title: '30초 생성', desc: 'AI가 순식간에 완성된 웹앱 코드를 생성하고 즉시 배포합니다.' },
              { icon: <Shield className="h-5 w-5" />, color: 'text-emerald-400 bg-emerald-400/10', title: '완전 무료', desc: '가입, 생성, 게시 모든 과정이 무료입니다. 신용카드가 필요 없습니다.' },
              { icon: <RefreshCw className="h-5 w-5" />, color: 'text-cyan-400 bg-cyan-400/10', title: '무한 수정', desc: '마음에 들지 않으면 피드백을 입력해 원하는 디자인이 될 때까지 수정하세요.' },
              { icon: <Globe className="h-5 w-5" />, color: 'text-violet-400 bg-violet-400/10', title: '즉시 공유', desc: '생성된 서비스는 고유 주소로 누구나 접근할 수 있습니다.' },
              { icon: <BarChart2 className="h-5 w-5" />, color: 'text-rose-400 bg-rose-400/10', title: '실제 데이터', desc: '54개 무료 API와 연동하여 실제 날씨, 뉴스, 환율 등을 표시합니다.' },
              { icon: <MousePointerClick className="h-5 w-5" />, color: 'text-blue-400 bg-blue-400/10', title: '코딩 불필요', desc: '코드를 전혀 몰라도 됩니다. 말로 설명하면 AI가 다 해결합니다.' },
            ].map((f, i) => (
              <div key={i} className="card p-6">
                <div className={`mb-4 inline-flex rounded-xl p-2.5 ${f.color}`}>{f.icon}</div>
                <h4 className="font-bold text-white">{f.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="relative py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.05] blur-[120px]" />
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/[0.05] blur-[100px]" />
        </div>
        <div className="mx-auto max-w-2xl px-6 text-center">
          <div
            className="gradient-border relative mx-auto max-w-xl overflow-hidden rounded-3xl p-10"
            style={{ background: 'var(--bg-card)' }}
          >
            <div className="pointer-events-none absolute inset-0 dot-bg opacity-20" />
            <div className="relative">
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20">
                  <Sparkles className="h-8 w-8 text-cyan-400" />
                </div>
              </div>
              <h3 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                지금 바로 시작해보세요
              </h3>
              <p className="mt-4 text-slate-400">
                회원가입 후 5분이면 나만의 웹서비스가 완성됩니다.
              </p>
              <Link
                href="/builder"
                className="btn-primary mt-8 inline-flex w-full items-center justify-center gap-2 py-4 text-base"
              >
                무료로 시작하기
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FloatingCard({
  className,
  delay,
  label,
  icon,
  value,
}: {
  className: string;
  delay: string;
  label: string;
  icon: React.ReactNode;
  value: string;
}) {
  return (
    <div
      className={`animate-float glass rounded-2xl px-4 py-3 shadow-xl ${className}`}
      style={{ animationDelay: delay, maxWidth: '200px' }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">
          {icon}
        </div>
        <span className="text-xs font-medium text-slate-400">{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}
