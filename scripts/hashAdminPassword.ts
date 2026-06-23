// scripts/hashAdminPassword.ts
// 단일 관리자(AUTH_PROVIDER=local) 비밀번호의 scrypt 해시를 생성한다.
//
// 사용법:
//   pnpm admin:hash '<평문 비밀번호>'
//   # 또는 (CI/비대화식) 환경변수로:
//   ADMIN_PASSWORD='<평문>' pnpm admin:hash
//
// 출력된 "salt:hash" 값을 배포 환경변수 ADMIN_PASSWORD_HASH 에 등록한다.
// 평문 비밀번호는 어디에도 저장·출력하지 않는다 (해시만 stdout으로 출력).
//
// 검증 로직은 src/lib/auth/adminCredentials.ts(hashPassword, 단위 테스트 대상)에 위임한다.

import { hashPassword, verifyPassword } from '../src/lib/auth/adminCredentials';

const password = process.argv[2] ?? process.env.ADMIN_PASSWORD ?? '';

if (!password.trim()) {
  console.error('비밀번호가 비어 있습니다.');
  console.error("사용법: pnpm admin:hash '<평문 비밀번호>'");
  console.error("   또는: ADMIN_PASSWORD='<평문>' pnpm admin:hash");
  process.exit(1);
}

const hash = hashPassword(password);

// 자가 검증 — 생성한 해시가 실제로 round-trip 되는지 확인(설정 실수 조기 차단).
if (!verifyPassword(password, hash)) {
  console.error('내부 오류: 생성된 해시 검증에 실패했습니다.');
  process.exit(1);
}

console.log('\n# ── 단일 관리자 비밀번호 해시 (AUTH_PROVIDER=local) ──');
console.log('# 아래 값을 배포 환경변수 ADMIN_PASSWORD_HASH 에 등록하세요.');
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\n# 함께 설정해야 하는 변수:');
console.log('#   AUTH_PROVIDER=local');
console.log('#   AUTH_SECRET=<openssl rand -base64 32 로 생성한 임의 시크릿>');
console.log('#   ADMIN_EMAIL=<로그인 이메일>');
console.log('#   (선택) ADMIN_NAME=<표시 이름>, ADMIN_USER_ID=<고정 UUID>');
console.log('');
