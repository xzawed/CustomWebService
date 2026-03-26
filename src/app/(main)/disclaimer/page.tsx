import Link from 'next/link';

export const metadata = {
  title: '면책 조항 - CustomWebService',
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">면책 조항</h1>
      <p className="mb-8 text-sm text-gray-500">최종 수정일: 2026-03-26</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">1. AI 생성 코드 관련</h2>
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
          <h2 className="mb-3 text-xl font-semibold text-gray-900">2. 무료 API 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>사용된 API는 각 제공자의 정책에 따라 중단, 변경, 유료 전환될 수 있습니다.</li>
            <li>API 장애 또는 데이터 오류로 인한 손해에 대해 서비스 제공자는 책임지지 않습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">3. 호스팅 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              무료 호스팅 플랫폼의 정책 변경 또는 장애로 인해 배포된 서비스가 중단될 수 있습니다.
            </li>
            <li>서비스의 가용성을 보장하지 않습니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">4. 데이터 관련</h2>
          <ul className="list-disc space-y-2 pl-6">
            <li>무료 서비스 특성상 데이터 백업을 보장하지 않습니다.</li>
            <li>중요한 데이터는 사용자가 별도 백업해야 합니다.</li>
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
