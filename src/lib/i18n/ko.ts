const ko = {
  // Error classes
  'error.notFound': '{resource}{id}을(를) 찾을 수 없습니다.',
  'error.authRequired': '로그인이 필요합니다.',
  'error.forbidden': '접근 권한이 없습니다.',
  'error.rateLimit': '요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.',
  'error.generation': '코드 생성에 실패했습니다.',
  'error.deploy': '배포에 실패했습니다.',
  'error.server': '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  'error.validation': '입력값이 올바르지 않습니다.',
  'error.database': '데이터베이스 오류: {message}',
  // Project service validation
  'project.validation.minApis': '최소 1개의 API를 선택해주세요.',
  'project.validation.maxApis': 'API는 최대 {max}개까지 선택 가능합니다.',
  'project.validation.contextMin': '서비스 설명은 최소 {min}자 이상 입력해주세요.',
  'project.validation.contextMax': '서비스 설명은 최대 {max}자까지 입력 가능합니다.',
  'project.validation.invalidApis': '존재하지 않는 API가 포함되어 있습니다.',
  'project.validation.maxProjects': '프로젝트는 최대 {max}개까지 생성 가능합니다.',
  'project.validation.notGenerated': '생성이 완료된 프로젝트만 게시할 수 있습니다.',
  'project.validation.notPublished': '게시된 프로젝트만 게시 취소할 수 있습니다.',
  'project.notFound': '프로젝트',
  // Deploy service
  'deploy.validation.noCode': '생성된 코드가 없습니다.',
  'deploy.progress.preparing': '배포 준비 중...',
  'deploy.progress.creatingRepo': 'GitHub 저장소 생성 중...',
  'deploy.progress.uploading': '코드 업로드 중...',
  'deploy.progress.configuring': '환경 설정 중...',
  'deploy.progress.deploying': '{platform}에 배포 중...',
  'deploy.progress.finalizing': '배포 마무리 중...',
  // Rate limit service
  'rateLimit.exceeded': '일일 생성 한도({limit}회)를 초과했습니다. 내일 다시 시도해주세요.',
} as const;

export default ko;
