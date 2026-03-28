import Link from 'next/link';

export const metadata = {
  title: '면책 조항 - CustomWebService',
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-[color:var(--text-primary)]">면책 조항</h1>
      <p className="mb-8 text-sm text-gray-500">최종 수정일: 2026-03-28</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">1. AI 생성 코드 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              AI가 생성한 코드는 참고 목적이며, 프로덕션 환경에서의 사용 시 사용자의 책임하에 검토
              후 사용해야 합니다.
            </li>
            <li>
              생성된 코드의 보안 취약점, 버그, 성능 이슈에 대해 서비스 제공자는 책임지지 않습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">2. 무료 API 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>사용된 API는 각 제공자의 정책에 따라 중단, 변경, 유료 전환될 수 있습니다.</li>
            <li>API 장애 또는 데이터 오류로 인한 손해에 대해 서비스 제공자는 책임지지 않습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">3. 호스팅 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              무료 호스팅 플랫폼의 정책 변경 또는 장애로 인해 배포된 서비스가 중단될 수 있습니다.
            </li>
            <li>서비스의 가용성을 보장하지 않습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">4. 데이터 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>무료 서비스 특성상 데이터 백업을 보장하지 않습니다.</li>
            <li>중요한 데이터는 사용자가 별도 백업해야 합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">5. 법적 한계</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              본 서비스를 통해 생성된 웹서비스는 어떠한 법적 조언, 의료 조언, 금융 조언도
              제공하지 않습니다.
            </li>
            <li>
              생성된 서비스를 통해 제공되는 정보의 정확성·최신성·완전성을 보장하지 않습니다.
            </li>
            <li>
              서비스 이용으로 인해 발생한 직접적·간접적·부수적 손해에 대해 서비스 제공자는
              법률상 허용되는 최대 범위 내에서 책임을 제한합니다.
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-12 flex gap-4 text-sm text-gray-500">
        <Link href="/terms" className="hover:text-gray-700 underline">
          이용약관
        </Link>
        <Link href="/privacy" className="hover:text-gray-700 underline">
          개인정보처리방침
        </Link>
      </div>
    </div>
  );
}
