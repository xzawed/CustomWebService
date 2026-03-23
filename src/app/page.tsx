import Link from 'next/link';
import { ArrowRight, Zap, MousePointerClick, Globe } from 'lucide-react';
import { Footer } from '@/components/layout/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">
            <span className="text-blue-600">Custom</span>WebService
          </h1>
          <nav className="flex items-center gap-4">
            <Link
              href="/catalog"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              API 카탈로그
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              시작하기
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-white py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <h2 className="text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
            무료 API로 나만의
            <br />
            <span className="text-blue-600">웹서비스</span>를 만드세요
          </h2>
          <p className="mt-6 text-lg text-gray-600">
            원하는 API를 골라 담고, 어떤 서비스를 만들고 싶은지 설명하면
            <br />
            AI가 자동으로 웹서비스를 생성하고 배포합니다. 모든 것이 무료.
          </p>
          <div className="mt-10">
            <Link
              href="/builder"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-semibold text-white shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all"
            >
              무료로 시작하기
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* 3-Step Guide */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4">
          <h3 className="text-center text-2xl font-bold text-gray-900">
            3단계로 완성
          </h3>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <StepCard
              step={1}
              icon={<MousePointerClick className="h-8 w-8 text-blue-600" />}
              title="API 선택"
              description="30+ 무료 API 중 원하는 것을 드래그 앤 드롭으로 골라 담으세요"
            />
            <StepCard
              step={2}
              icon={<Zap className="h-8 w-8 text-blue-600" />}
              title="서비스 설명"
              description="어떤 서비스를 만들고 싶은지 자연어로 설명해주세요"
            />
            <StepCard
              step={3}
              icon={<Globe className="h-8 w-8 text-blue-600" />}
              title="자동 생성 & 배포"
              description="AI가 코드를 생성하고 자동으로 배포합니다. URL을 바로 받으세요"
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
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">
        {step}
      </div>
      <div className="mb-3 flex justify-center">{icon}</div>
      <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}
