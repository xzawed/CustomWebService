export interface GuideStep {
  title: string;
  description: string;
}

export interface ApiKeyGuide {
  signupUrl: string;
  estimatedTime: string;
  steps: GuideStep[];
  keyLabel: string;
  keyFormat: string;
  groupNote?: string;
  tips?: string[];
}

/**
 * API 이름 → 발급 가이드 매핑
 * 비개발자(노인 포함)도 이해할 수 있도록 최대한 쉬운 표현 사용
 */
const GUIDES: Record<string, ApiKeyGuide> = {
  // ── 공공데이터포털 (한 번 가입으로 아래 모든 API 사용 가능) ───────────────
  PUBLIC_DATA_PORTAL: {
    signupUrl: 'https://www.data.go.kr/ugs/selectPublicDataJoinView.do',
    estimatedTime: '약 5분',
    groupNote:
      '공공데이터포털에 한 번 가입하면 기상청, 아파트 실거래가, 버스·지하철, 에어코리아 등 정부 API를 모두 같은 키 하나로 사용할 수 있어요.',
    steps: [
      {
        title: '1단계: 공공데이터포털 접속',
        description:
          '아래 [가입하러 가기] 버튼을 눌러 공공데이터포털(data.go.kr) 홈페이지를 여세요.',
      },
      {
        title: '2단계: 회원가입',
        description:
          '화면 오른쪽 위 파란색 [회원가입] 버튼을 클릭하세요. 이메일 주소와 비밀번호를 입력하고 인증 메일을 확인하면 가입이 완료됩니다.',
      },
      {
        title: '3단계: 로그인',
        description:
          '가입한 이메일과 비밀번호로 로그인하세요.',
      },
      {
        title: '4단계: API 활용 신청',
        description:
          '상단 검색창에 사용하려는 API 이름(예: "기상청 단기예보")을 검색하세요. 검색 결과에서 해당 항목을 클릭한 후 파란색 [활용신청] 버튼을 클릭하세요. 활용 목적에 "개인 학습 및 서비스 개발"을 입력하고 신청하면 됩니다.',
      },
      {
        title: '5단계: 키 확인',
        description:
          '로그인 후 화면 오른쪽 위 사람 아이콘을 클릭 → [마이페이지] → [개발계정] → [인증키 관리]로 이동하세요. 화면에 표시된 인증키(긴 문자열)를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: '인증키',
    keyFormat: '영문+숫자 혼합 긴 문자열 (예: abc123xyz...)',
    tips: [
      '인증키는 신청 후 보통 즉시 발급되거나 1~2일 내 자동 승인됩니다.',
      '공공데이터포털 인증키 1개로 정부 제공 API를 모두 사용할 수 있습니다.',
    ],
  },

  // ── OpenWeatherMap ────────────────────────────────────────────────────────
  OpenWeatherMap: {
    signupUrl: 'https://home.openweathermap.org/users/sign_up',
    estimatedTime: '약 3분',
    steps: [
      {
        title: '1단계: 회원가입 페이지 열기',
        description:
          '아래 [가입하러 가기] 버튼을 눌러 OpenWeatherMap 회원가입 페이지를 여세요.',
      },
      {
        title: '2단계: 정보 입력',
        description:
          '이름, 이메일 주소, 비밀번호를 입력하고 "I am 16 years old..." 체크박스에 체크한 후 [Create Account] 버튼을 클릭하세요.',
      },
      {
        title: '3단계: 이메일 인증',
        description:
          '입력한 이메일 받은편지함을 열어 OpenWeatherMap에서 온 인증 메일을 찾아 [Verify your email] 버튼을 클릭하세요.',
      },
      {
        title: '4단계: API 키 복사',
        description:
          '로그인 후 상단 메뉴에서 자신의 이름을 클릭 → [My API keys]를 선택하세요. "Default" 키 옆에 있는 키 문자열을 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API key',
    keyFormat: '영문+숫자 32자리 (예: a1b2c3d4e5f6...)',
    tips: [
      '무료 플랜으로 하루 1,000번까지 날씨 정보를 조회할 수 있어요.',
      '영어 사이트지만 가입 과정은 간단합니다.',
    ],
  },

  // ── WeatherAPI.com ────────────────────────────────────────────────────────
  'WeatherAPI.com': {
    signupUrl: 'https://www.weatherapi.com/signup.aspx',
    estimatedTime: '약 3분',
    steps: [
      {
        title: '1단계: 가입 페이지 열기',
        description: '아래 [가입하러 가기] 버튼을 클릭해 WeatherAPI 가입 페이지를 여세요.',
      },
      {
        title: '2단계: 정보 입력 후 가입',
        description:
          '이메일 주소와 비밀번호를 입력하고 [Sign Up] 버튼을 클릭하세요. 이메일 인증 없이 바로 로그인할 수 있습니다.',
      },
      {
        title: '3단계: API 키 복사',
        description:
          '로그인 후 대시보드 화면 상단에 "Your API Key:" 라고 표시된 긴 문자열이 보입니다. 그 문자열 전체를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API Key',
    keyFormat: '영문+숫자 32자리',
    tips: ['무료 플랜으로 하루 100만 건까지 사용 가능합니다 (매우 넉넉해요).'],
  },

  // ── NewsAPI.org ───────────────────────────────────────────────────────────
  'NewsAPI.org': {
    signupUrl: 'https://newsapi.org/register',
    estimatedTime: '약 2분',
    steps: [
      {
        title: '1단계: 가입 페이지 열기',
        description: '아래 [가입하러 가기] 버튼을 클릭하세요.',
      },
      {
        title: '2단계: 정보 입력',
        description:
          '이름(First name, Last name), 이메일, 비밀번호를 영어로 입력하고 [Submit] 버튼을 클릭하세요.',
      },
      {
        title: '3단계: API 키 확인',
        description:
          '가입 완료 후 화면에 API Key가 바로 표시됩니다. 또는 로그인 후 상단 메뉴 [Account]에서도 확인할 수 있습니다. 해당 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API Key',
    keyFormat: '영문+숫자 32자리',
    tips: ['무료 플랜은 하루 최대 100건까지만 뉴스를 불러올 수 있습니다.'],
  },

  // ── NASA ──────────────────────────────────────────────────────────────────
  'NASA 오늘의 천문 사진': {
    signupUrl: 'https://api.nasa.gov/',
    estimatedTime: '약 2분',
    steps: [
      {
        title: '1단계: NASA API 페이지 열기',
        description: '아래 [가입하러 가기] 버튼을 클릭하세요.',
      },
      {
        title: '2단계: 정보 입력',
        description:
          'First Name(이름), Last Name(성), Email(이메일)을 입력하고 [Signup] 버튼을 클릭하세요. 별도의 비밀번호 설정은 필요 없어요.',
      },
      {
        title: '3단계: 이메일 확인',
        description:
          '입력한 이메일 받은편지함을 열면 NASA에서 보낸 메일에 API Key가 적혀 있습니다. 그 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API Key',
    keyFormat: '영문+숫자 40자리',
    tips: ['NASA API는 완전 무료이며 하루 1,000번 사용 가능합니다.'],
  },

  // ── Unsplash ──────────────────────────────────────────────────────────────
  Unsplash: {
    signupUrl: 'https://unsplash.com/join',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: Unsplash 가입',
        description:
          '아래 [가입하러 가기] 버튼을 클릭해 가입하세요. 이메일 또는 구글 계정으로 가입할 수 있습니다.',
      },
      {
        title: '2단계: 개발자 페이지 이동',
        description:
          '로그인 후 unsplash.com/developers 주소로 이동하거나 하단 스크롤을 내려 [API/Developers] 링크를 클릭하세요.',
      },
      {
        title: '3단계: 앱 등록',
        description:
          '[Your apps] → [New Application] 버튼을 클릭하세요. 두 개의 동의 체크박스에 체크하고 [Accept terms]를 클릭한 후, 앱 이름과 설명을 간단히 입력하고 [Create application]을 클릭하세요.',
      },
      {
        title: '4단계: Access Key 복사',
        description:
          '앱 상세 페이지에서 아래로 스크롤하면 "Keys" 섹션에 Access Key가 보입니다. 이 값을 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'Access Key',
    keyFormat: '영문+숫자+기호 약 43자리',
  },

  // ── The Cat API ───────────────────────────────────────────────────────────
  'The Cat API': {
    signupUrl: 'https://thecatapi.com/signup',
    estimatedTime: '약 2분',
    steps: [
      {
        title: '1단계: 가입 페이지 열기',
        description: '아래 [가입하러 가기] 버튼을 클릭하세요.',
      },
      {
        title: '2단계: 이메일 입력',
        description:
          '이메일 주소를 입력하고 [GET FREE ACCESS] 버튼을 클릭하세요.',
      },
      {
        title: '3단계: 이메일 확인',
        description:
          '입력한 이메일 받은편지함을 열면 API Key가 포함된 메일이 도착해 있습니다. 해당 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API Key',
    keyFormat: '영문+숫자+기호 혼합',
    tips: ['완전 무료로 고양이 사진을 무제한으로 가져올 수 있어요.'],
  },

  // ── 카카오 ────────────────────────────────────────────────────────────────
  '카카오 로컬 (지도+장소 검색)': {
    signupUrl: 'https://developers.kakao.com',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: 카카오 개발자 페이지 열기',
        description:
          '아래 [가입하러 가기] 버튼을 클릭하세요. 카카오 계정(카카오톡)으로 로그인하시면 됩니다.',
      },
      {
        title: '2단계: 애플리케이션 만들기',
        description:
          '상단 메뉴에서 [내 애플리케이션]을 클릭하고 오른쪽 위 [애플리케이션 추가하기] 버튼을 클릭하세요. 앱 이름과 회사명을 입력(개인이면 본인 이름 입력)하고 [저장]을 클릭하세요.',
      },
      {
        title: '3단계: REST API 키 복사',
        description:
          '생성된 앱을 클릭하면 [앱 키] 항목에 4가지 키가 보입니다. 이 중 [REST API 키] 옆의 값을 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'REST API 키',
    keyFormat: '영문+숫자 32자리',
    tips: [
      '카카오 API는 하루 30만 건까지 무료로 사용할 수 있어요.',
      '카카오톡 계정이 있으면 별도 가입 없이 바로 로그인할 수 있어요.',
    ],
  },

  // ── 네이버 ────────────────────────────────────────────────────────────────
  '네이버 지도 (Geocoding)': {
    signupUrl: 'https://developers.naver.com/apps/#/register',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: 네이버 개발자 센터 열기',
        description:
          '아래 [가입하러 가기] 버튼을 클릭하세요. 네이버 계정으로 로그인하시면 됩니다.',
      },
      {
        title: '2단계: 애플리케이션 등록',
        description:
          '로그인 후 [Application 등록] 화면에서 애플리케이션 이름을 입력하고, "사용 API" 목록에서 [Maps]를 선택하세요. 그 아래 서비스 URL에 https://xzawed.xyz 를 입력하고 [등록하기]를 클릭하세요.',
      },
      {
        title: '3단계: Client ID 복사',
        description:
          '등록 완료 후 [내 애플리케이션]에서 방금 만든 앱을 클릭하면 "Client ID" 값이 보입니다. 이 값을 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'Client ID',
    keyFormat: '영문+숫자 약 20자리',
    tips: ['네이버 지도 API는 하루 25만 건까지 무료입니다.'],
  },

  // ── ODsay ─────────────────────────────────────────────────────────────────
  'ODsay 대중교통 길찾기': {
    signupUrl: 'https://lab.odsay.com/guide/guide#apiKeyView',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: ODsay 연구소 가입',
        description:
          '아래 [가입하러 가기] 버튼을 클릭하세요. 이메일로 회원가입을 진행하세요.',
      },
      {
        title: '2단계: API 신청',
        description:
          '로그인 후 상단 메뉴 [API 신청]을 클릭하세요. 서비스 정보를 입력하고 신청하면 됩니다.',
      },
      {
        title: '3단계: API Key 확인',
        description:
          '승인(보통 1~2일 소요) 후 [마이페이지] → [API Key 관리]에서 발급된 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API Key',
    keyFormat: '영문+숫자+기호 혼합',
    tips: ['ODsay는 대중교통 길찾기 전문 서비스로 하루 1,000건까지 무료입니다.'],
  },

  // ── 서울 열린데이터광장 ───────────────────────────────────────────────────
  '서울 열린데이터광장': {
    signupUrl: 'https://data.seoul.go.kr/together/user/userJoin.do',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: 서울 열린데이터광장 가입',
        description:
          '아래 [가입하러 가기] 버튼을 클릭해 회원가입 페이지를 여세요. 이름, 이메일, 비밀번호를 입력하고 가입하세요.',
      },
      {
        title: '2단계: 인증키 신청',
        description:
          '로그인 후 오른쪽 위 사람 아이콘 → [마이페이지] → [인증키 관리] → [인증키 신청] 버튼을 클릭하세요.',
      },
      {
        title: '3단계: 인증키 복사',
        description:
          '신청 후 바로 발급된 인증키가 화면에 표시됩니다. 해당 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: '인증키',
    keyFormat: '영문+숫자 혼합',
    groupNote: '서울시 버스 도착정보, 지하철 실시간 정보에도 같은 키를 사용합니다.',
    tips: ['서울시 열린데이터 키 하나로 서울 버스·지하철 API도 함께 사용할 수 있어요.'],
  },

  // ── 한국은행 ECOS ─────────────────────────────────────────────────────────
  '한국은행 경제통계 (ECOS)': {
    signupUrl: 'https://ecos.bok.or.kr/api/#/LoginPage',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: ECOS 오픈 API 가입',
        description:
          '아래 [가입하러 가기] 버튼을 클릭하세요. 회원가입 후 로그인하세요.',
      },
      {
        title: '2단계: API 키 신청',
        description:
          '로그인 후 [인증키 신청] 메뉴를 클릭하세요. 용도(예: "개인 서비스 개발")를 입력하고 신청하세요.',
      },
      {
        title: '3단계: 이메일로 키 수령',
        description:
          '신청 후 1~2일 내에 등록한 이메일로 API 키가 발송됩니다. 이메일에서 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: '인증키',
    keyFormat: '영문+숫자 40자리',
  },
};

// 공공데이터포털 계열 API들은 같은 가이드 사용
const PUBLIC_DATA_APIS = [
  '기상청 단기예보',
  '기상청 중기예보',
  '아파트 실거래가 (국토교통부)',
  '에어코리아 대기오염정보',
  '한국관광공사 TourAPI',
  'TAGO 전국 대중교통',
  '공휴일 정보 (한국천문연구원)',
  '국립중앙도서관 도서 검색',
  '서울시 버스 도착정보',
  '서울시 지하철 실시간 도착정보',
];
for (const name of PUBLIC_DATA_APIS) {
  GUIDES[name] = GUIDES.PUBLIC_DATA_PORTAL;
}

export function getApiKeyGuide(apiName: string): ApiKeyGuide | null {
  return GUIDES[apiName] ?? null;
}

/** 가이드가 없는 API용 기본 안내 */
export function getDefaultGuide(docsUrl: string | null): ApiKeyGuide {
  return {
    signupUrl: docsUrl ?? '#',
    estimatedTime: '약 5분',
    steps: [
      {
        title: '1단계: 공식 사이트 방문',
        description:
          '아래 [가입하러 가기] 버튼을 클릭해 해당 API 공식 사이트를 여세요.',
      },
      {
        title: '2단계: 회원가입 및 API 키 발급',
        description:
          '사이트에서 회원가입 후 API 키(또는 인증키)를 발급받으세요. 보통 [API Keys], [인증키], [개발자 센터] 메뉴에서 찾을 수 있어요.',
      },
      {
        title: '3단계: 키 입력',
        description: '발급받은 키를 복사하여 아래 입력란에 붙여넣으세요.',
      },
    ],
    keyLabel: 'API 키',
    keyFormat: '영문+숫자 혼합',
  };
}
