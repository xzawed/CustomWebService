import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class ProfileTemplate implements ICodeTemplate {
  readonly id = 'profile';
  readonly name = '프로필/포트폴리오';
  readonly description = '헤더 배너 + 스탯 카드 + 활동 피드';
  readonly category = 'profile';
  readonly supportedApiCategories = ['프로필', '포트폴리오', '깃허브', 'profile', 'portfolio', 'github', 'user'];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some((cat) =>
        api.category.toLowerCase().includes(cat.toLowerCase()) ||
        api.name.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matchingApis.length / apis.length : 0;
  }

  generate(context: TemplateContext): TemplateOutput {
    return {
      html: `<div class="profile-app">
    <div class="profile-banner">
      <div class="banner-bg"></div>
      <div class="profile-identity">
        <div class="avatar" id="avatar">?</div>
        <div class="identity-text">
          <h1 id="profile-name">프로필</h1>
          <p id="profile-bio">${context.userContext.slice(0, 60)}</p>
        </div>
      </div>
    </div>
    <div class="profile-body">
      <div class="stats-row" id="stats-row"></div>
      <div class="tabs">
        <button class="ptab active" data-tab="activity">활동</button>
        <button class="ptab" data-tab="projects">프로젝트</button>
        <button class="ptab" data-tab="skills">스킬</button>
      </div>
      <div class="tab-content" id="tab-content"></div>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; }
.profile-app { max-width: 800px; margin: 0 auto; }
.profile-banner { position: relative; padding: 2rem; padding-top: 3rem; background: linear-gradient(135deg, #1e293b 0%, #3b82f6 100%); color: white; }
.profile-identity { display: flex; align-items: center; gap: 1.25rem; position: relative; }
.avatar { width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.2); border: 3px solid rgba(255,255,255,0.5); display: flex; align-items: center; justify-content: center; font-size: 2rem; flex-shrink: 0; overflow: hidden; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.identity-text h1 { font-size: 1.4rem; font-weight: 700; }
.identity-text p { font-size: 0.875rem; opacity: 0.85; margin-top: 0.2rem; }
.profile-body { padding: 1.5rem; }
.stats-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: white; border-radius: 12px; padding: 1rem; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.stat-value { font-size: 1.5rem; font-weight: 700; color: #3b82f6; }
.stat-label { font-size: 0.75rem; color: #64748b; margin-top: 0.25rem; }
.tabs { display: flex; gap: 0.25rem; border-bottom: 2px solid #e2e8f0; margin-bottom: 1.25rem; }
.ptab { padding: 0.625rem 1.25rem; border: none; background: transparent; font-size: 0.875rem; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
.ptab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 600; }
.tab-content { min-height: 200px; }
.activity-item { display: flex; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.875rem; }
.activity-icon { font-size: 1rem; width: 24px; text-align: center; flex-shrink: 0; }
.activity-text { flex: 1; color: #334155; }
.activity-time { color: #94a3b8; font-size: 0.75rem; flex-shrink: 0; }
.project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
.project-card { background: white; border-radius: 10px; padding: 1rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.project-name { font-weight: 600; color: #1e293b; font-size: 0.875rem; }
.project-desc { color: #64748b; font-size: 0.8rem; margin-top: 0.25rem; }
.skill-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.skill-tag { padding: 0.375rem 0.875rem; background: #eff6ff; color: #1d4ed8; border-radius: 20px; font-size: 0.8rem; font-weight: 500; }`,
      js: `const tabData = {
  activity: [
    { icon: '⭐', text: '저장소 스타 획득', time: '1시간 전' },
    { icon: '💻', text: '코드 커밋', time: '3시간 전' },
    { icon: '🔀', text: 'PR 머지', time: '1일 전' },
  ],
  projects: [
    { name: '프로젝트 A', desc: '설명을 입력하세요.' },
    { name: '프로젝트 B', desc: '설명을 입력하세요.' },
  ],
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python'],
};

async function loadProfile() {
  try {
    // 실제 API 호출로 교체
    const profile = { name: '사용자', bio: '개발자', avatar: null, stats: [{ label: '저장소', value: '42' }, { label: '팔로워', value: '128' }, { label: '커밋', value: '1.2K' }] };
    if (profile.avatar) {
      document.getElementById('avatar').innerHTML = '<img src="' + profile.avatar + '" alt="avatar"/>';
    } else {
      document.getElementById('avatar').textContent = profile.name[0].toUpperCase();
    }
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-bio').textContent = profile.bio;
    document.getElementById('stats-row').innerHTML = profile.stats.map(s =>
      '<div class="stat-card"><div class="stat-value">' + s.value + '</div><div class="stat-label">' + s.label + '</div></div>'
    ).join('');
  } catch (err) {
    console.error(err);
  }
  renderTab('activity');
}

function renderTab(tab) {
  const content = document.getElementById('tab-content');
  if (tab === 'activity') {
    content.innerHTML = tabData.activity.map(a =>
      '<div class="activity-item"><span class="activity-icon">' + a.icon + '</span><span class="activity-text">' + a.text + '</span><span class="activity-time">' + a.time + '</span></div>'
    ).join('');
  } else if (tab === 'projects') {
    content.innerHTML = '<div class="project-grid">' + tabData.projects.map(p =>
      '<div class="project-card"><div class="project-name">' + p.name + '</div><div class="project-desc">' + p.desc + '</div></div>'
    ).join('') + '</div>';
  } else if (tab === 'skills') {
    content.innerHTML = '<div class="skill-list">' + tabData.skills.map(s =>
      '<span class="skill-tag">' + s + '</span>'
    ).join('') + '</div>';
  }
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (!target?.classList.contains('ptab')) return;
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
  target.classList.add('active');
  renderTab(target.dataset['tab'] ?? 'activity');
});

loadProfile();`,
      promptHint: `Layout: profile-portfolio
Required sections (in order): 헤더 배너(그라디언트 + 아바타 + 이름/바이오), 스탯 카드 행, 탭(활동/프로젝트/스킬), 탭 컨텐츠
UI patterns: 배너 그라디언트(남색→파랑), 원형 아바타, 그리드 스탯 카드, 언더라인 탭
Must include: 아바타(이미지 또는 이니셜 폴백), 스탯 카드 최소 3개, 탭 전환, 활동 피드
Avoid: 전체 페이지 스크롤 없는 단일 카드, 차트, 지도`,
    };
  }
}
