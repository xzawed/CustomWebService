import Link from 'next/link';

export const metadata = {
  title: '이용약관 - CustomWebService',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-[color:var(--text-primary)]">이용약관</h1>
      <p className="mb-8 text-sm text-gray-500">최종 수정일: 2026-03-28</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제1조 (목적)</h2>
          <p>
            본 약관은 CustomWebService(이하 &quot;서비스&quot;)의 이용 조건 및 절차, 이용자와 서비스
            제공자 간의 권리·의무를 규정합니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제2조 (이용 자격)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              <span className="font-medium">연령 제한:</span> 본 서비스는{' '}
              <span className="font-semibold text-red-700">만 14세 이상</span>만 이용할 수 있습니다.
              개인정보보호법 제22조의2에 따라 만 14세 미만 아동의 가입을 허용하지 않습니다.
            </li>
            <li>
              소셜 로그인을 통해 회원가입 시, 본 약관에 동의한 것으로 간주합니다.
            </li>
            <li>
              타인의 정보를 이용하거나 허위 정보로 가입한 경우, 서비스 제공자는 즉시 계정을
              삭제할 수 있습니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제3조 (정의)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              &quot;서비스&quot;란 사용자가 무료 API를 선택하고 서비스 설명을 입력하면 AI가
              웹서비스를 자동 생성·배포하는 플랫폼을 의미합니다.
            </li>
            <li>&quot;사용자&quot;란 본 약관에 동의하고 서비스를 이용하는 자를 의미합니다.</li>
            <li>
              &quot;생성 서비스&quot;란 사용자의 요청에 따라 AI가 자동 생성한 웹서비스를 의미합니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제4조 (서비스 제공)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>서비스는 무료로 제공됩니다.</li>
            <li>서비스 제공자는 사전 고지 없이 서비스의 내용을 변경하거나 중단할 수 있습니다.</li>
            <li>
              서비스는 무료 외부 API에 의존하므로, 해당 API의 정책 변경에 따라 서비스 기능이 제한될
              수 있습니다.
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제5조 (사용자 의무)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>
              사용자는 다음 행위를 해서는 안 됩니다:
              <ul className="mt-2 list-disc space-y-1 pl-6">
                <li>불법적인 목적의 서비스 생성</li>
                <li>타인의 권리를 침해하는 서비스 생성</li>
                <li>악성 코드를 포함하는 서비스 생성 시도</li>
                <li>서비스의 정상 운영을 방해하는 행위</li>
                <li>API의 이용 정책을 위반하는 행위</li>
              </ul>
            </li>
            <li>사용자는 생성된 서비스의 내용에 대해 책임을 집니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제6조 (지적 재산권)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>서비스 플랫폼의 지적 재산권은 서비스 제공자에게 있습니다.</li>
            <li>AI가 생성한 코드의 저작권은 사용자에게 귀속됩니다.</li>
            <li>사용된 무료 API의 데이터는 각 API 제공자의 라이선스를 따릅니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제7조 (면책 조항)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>AI가 생성한 코드의 정확성, 안전성, 완전성을 보장하지 않습니다.</li>
            <li>생성된 서비스로 인해 발생한 손해에 대해 책임지지 않습니다.</li>
            <li>무료 API의 장애, 정책 변경으로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
            <li>무료 호스팅 플랫폼의 장애로 인한 서비스 중단에 대해 책임지지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제8조 (서비스 이용 제한)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>사용자당 일일 서비스 생성 횟수: 10회</li>
            <li>프로젝트당 최대 API 선택 수: 5개</li>
            <li>위 제한은 서비스 운영 상황에 따라 변경될 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제9조 (계정 및 데이터)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>사용자는 언제든지 계정을 삭제할 수 있습니다.</li>
            <li>계정 삭제 시 관련 데이터(프로젝트, 생성 코드)는 삭제됩니다.</li>
            <li>배포된 서비스는 별도로 삭제 요청해야 합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제10조 (약관 변경)</h2>
          <ol className="list-decimal space-y-2 pl-6">
            <li>약관 변경 시 서비스 내 공지합니다.</li>
            <li>변경된 약관에 동의하지 않는 사용자는 서비스 이용을 중단할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-[color:var(--text-primary)]">제11조 (준거법 및 관할)</h2>
          <p>본 약관은 대한민국 법을 준거법으로 합니다.</p>
        </section>
      </div>

      <div className="mt-12 flex gap-4 text-sm text-gray-500">
        <Link href="/privacy" className="hover:text-gray-700 underline">
          개인정보처리방침
        </Link>
        <Link href="/disclaimer" className="hover:text-gray-700 underline">
          면책 조항
        </Link>
      </div>
    </div>
  );
}
