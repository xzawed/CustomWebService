import Link from 'next/link';

export const metadata = {
  title: '개인정보처리방침 - CustomWebService',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-gray-900">개인정보처리방침</h1>
      <p className="mb-8 text-sm text-gray-500">최종 수정일: 2026-03-26</p>

      <div className="space-y-8 text-gray-700 leading-relaxed">
        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            1. 수집하는 개인정보
          </h2>

          <h3 className="mb-2 mt-4 font-semibold text-gray-800">가. 필수 수집 항목</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              소셜 로그인 시: 이메일 주소, 이름, 프로필 이미지 URL (Google/GitHub 제공 정보)
            </li>
          </ul>

          <h3 className="mb-2 mt-4 font-semibold text-gray-800">나. 자동 수집 항목</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>서비스 이용 기록 (생성한 프로젝트, 선택한 API)</li>
            <li>접속 로그 (IP 주소, 브라우저 정보, 접속 시간)</li>
          </ul>

          <h3 className="mb-2 mt-4 font-semibold text-gray-800">
            다. 수집하지 않는 항목
          </h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>결제 정보 (무료 서비스)</li>
            <li>주민등록번호, 전화번호</li>
            <li>위치 정보</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            2. 개인정보의 이용 목적
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>서비스 제공 및 사용자 인증</li>
            <li>생성된 프로젝트 관리</li>
            <li>서비스 개선 및 통계 분석</li>
            <li>장애 대응 및 기술 지원</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            3. 개인정보의 보관 및 파기
          </h2>

          <h3 className="mb-2 mt-4 font-semibold text-gray-800">가. 보관 기간</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>계정 정보: 회원 탈퇴 시까지</li>
            <li>서비스 이용 기록: 마지막 이용일로부터 1년</li>
            <li>접속 로그: 3개월</li>
          </ul>

          <h3 className="mb-2 mt-4 font-semibold text-gray-800">나. 파기 절차</h3>
          <ul className="list-disc space-y-1 pl-6">
            <li>보관 기간 경과 시 자동 삭제</li>
            <li>회원 탈퇴 요청 시 즉시 삭제 (배포된 서비스 포함)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            4. 개인정보의 제3자 제공
          </h2>
          <p>개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우 예외입니다:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>법령에 따른 요청이 있는 경우</li>
            <li>사용자가 사전에 동의한 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            5. 개인정보의 처리 위탁
          </h2>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-semibold">수탁자</th>
                  <th className="pb-2 pr-4 font-semibold">위탁 업무</th>
                  <th className="pb-2 font-semibold">보관 위치</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-2 pr-4">Supabase</td>
                  <td className="py-2 pr-4">데이터베이스 호스팅</td>
                  <td className="py-2">AWS</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Railway</td>
                  <td className="py-2 pr-4">웹 호스팅 및 배포</td>
                  <td className="py-2">GCP</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Google</td>
                  <td className="py-2 pr-4">소셜 로그인 인증</td>
                  <td className="py-2">Google Cloud</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">GitHub</td>
                  <td className="py-2 pr-4">소셜 로그인 인증, 코드 저장</td>
                  <td className="py-2">GitHub</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">6. 사용자의 권리</h2>
          <p>사용자는 다음 권리를 행사할 수 있습니다:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>개인정보 열람 요청</li>
            <li>개인정보 수정 요청</li>
            <li>개인정보 삭제 요청 (계정 삭제)</li>
            <li>개인정보 처리 정지 요청</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">7. 쿠키 사용</h2>
          <p>
            로그인 세션 유지를 위한 필수 쿠키만 사용합니다. 광고 추적 쿠키 및 제3자 마케팅
            쿠키는 사용하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">
            8. 개인정보 보호 조치
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>데이터 전송 시 HTTPS(TLS) 암호화</li>
            <li>데이터베이스 Row Level Security 적용</li>
            <li>API 키 암호화 저장</li>
            <li>접근 권한 최소화</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-gray-900">9. 방침 변경</h2>
          <p>본 방침 변경 시 서비스 내 공지합니다.</p>
        </section>
      </div>

      <div className="mt-12 flex gap-4 text-sm text-gray-500">
        <Link href="/terms" className="hover:text-gray-700 underline">
          이용약관
        </Link>
        <Link href="/disclaimer" className="hover:text-gray-700 underline">
          면책 조항
        </Link>
      </div>
    </div>
  );
}
