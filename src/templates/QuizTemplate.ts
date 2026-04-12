import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class QuizTemplate implements ICodeTemplate {
  readonly id = 'quiz';
  readonly name = '퀴즈/인터랙티브';
  readonly description = '질문 카드 + 진행바 + 결과 요약';
  readonly category = 'quiz';
  readonly supportedApiCategories = ['퀴즈', '교육', '학습', 'quiz', 'education', 'trivia', 'learning'];

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
      html: `<div class="quiz-app">
    <div class="quiz-start" id="quiz-start">
      <h1>퀴즈</h1>
      <p>${context.userContext.slice(0, 80)}</p>
      <button id="start-btn" onclick="startQuiz()">퀴즈 시작</button>
    </div>
    <div class="quiz-main" id="quiz-main" style="display:none;">
      <div class="progress-bar-wrap">
        <div class="progress-bar" id="progress-bar" style="width:0%"></div>
      </div>
      <div class="quiz-counter" id="quiz-counter"></div>
      <div class="question-card" id="question-card">
        <div class="question-text" id="question-text"></div>
        <div class="options" id="options"></div>
      </div>
      <button class="next-btn" id="next-btn" style="display:none;" onclick="nextQuestion()">다음 →</button>
    </div>
    <div class="quiz-result" id="quiz-result" style="display:none;">
      <div class="result-score" id="result-score"></div>
      <div class="result-msg" id="result-msg"></div>
      <div class="result-breakdown" id="result-breakdown"></div>
      <button onclick="resetQuiz()">다시 풀기</button>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
.quiz-app { max-width: 560px; width: 100%; padding: 2rem; }
.quiz-start { text-align: center; }
.quiz-start h1 { font-size: 2rem; font-weight: 800; color: #1e293b; }
.quiz-start p { color: #64748b; margin: 0.75rem 0 2rem; }
#start-btn, .quiz-result button { padding: 0.875rem 2.5rem; background: #3b82f6; color: white; border: none; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
#start-btn:hover, .quiz-result button:hover { background: #2563eb; }
.progress-bar-wrap { height: 6px; background: #e2e8f0; border-radius: 3px; margin-bottom: 1.25rem; overflow: hidden; }
.progress-bar { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.4s; }
.quiz-counter { font-size: 0.8rem; color: #64748b; margin-bottom: 1rem; text-align: right; }
.question-card { background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
.question-text { font-size: 1.05rem; font-weight: 600; color: #1e293b; line-height: 1.5; margin-bottom: 1.5rem; }
.options { display: flex; flex-direction: column; gap: 0.75rem; }
.option-btn { padding: 0.875rem 1rem; border: 2px solid #e2e8f0; background: white; border-radius: 10px; font-size: 0.9rem; text-align: left; cursor: pointer; transition: all 0.15s; }
.option-btn:hover:not(.answered) { border-color: #93c5fd; background: #eff6ff; }
.option-btn.correct { border-color: #22c55e; background: #dcfce7; color: #166534; }
.option-btn.wrong { border-color: #ef4444; background: #fee2e2; color: #991b1b; }
.next-btn { width: 100%; margin-top: 1.25rem; padding: 0.75rem; background: #1e293b; color: white; border: none; border-radius: 10px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
.quiz-result { text-align: center; }
.result-score { font-size: 3rem; font-weight: 800; color: #3b82f6; }
.result-msg { font-size: 1.1rem; color: #475569; margin: 0.5rem 0 1.5rem; }
.result-breakdown { background: white; border-radius: 12px; padding: 1rem; margin-bottom: 1.5rem; text-align: left; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.breakdown-item { display: flex; justify-content: space-between; padding: 0.375rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.8rem; color: #475569; }
.breakdown-item:last-child { border-bottom: none; }`,
      js: `let questions = [];
let current = 0;
let score = 0;
let answers = [];

async function startQuiz() {
  try {
    // 실제 API 호출로 교체
    questions = [
      { q: '대한민국의 수도는?', options: ['서울', '부산', '인천', '대구'], answer: 0 },
      { q: '1 + 1 = ?', options: ['1', '2', '3', '4'], answer: 1 },
      { q: 'HTML 태그가 아닌 것은?', options: ['<div>', '<span>', '<foo>', '<p>'], answer: 2 },
    ];
    document.getElementById('quiz-start').style.display = 'none';
    document.getElementById('quiz-main').style.display = 'block';
    showQuestion();
  } catch (err) {
    document.getElementById('quiz-start').querySelector('p').textContent = '퀴즈를 불러오지 못했습니다.';
  }
}

function showQuestion() {
  const q = questions[current];
  const pct = (current / questions.length * 100).toFixed(0);
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('quiz-counter').textContent = (current + 1) + ' / ' + questions.length;
  document.getElementById('question-text').textContent = q.q;
  document.getElementById('next-btn').style.display = 'none';
  document.getElementById('options').innerHTML = q.options.map((opt, i) =>
    '<button class="option-btn" onclick="selectOption(' + i + ', this)">' + opt + '</button>'
  ).join('');
}

function selectOption(idx, btn) {
  if (document.querySelector('.option-btn.correct, .option-btn.wrong')) return;
  const q = questions[current];
  const correct = q.answer === idx;
  if (correct) score++;
  btn.classList.add(correct ? 'correct' : 'wrong');
  if (!correct) {
    const btns = document.querySelectorAll('.option-btn');
    btns[q.answer].classList.add('correct');
  }
  document.querySelectorAll('.option-btn').forEach(b => b.classList.add('answered'));
  answers.push({ q: q.q, correct });
  document.getElementById('next-btn').style.display = 'block';
}

function nextQuestion() {
  current++;
  if (current < questions.length) {
    showQuestion();
  } else {
    showResult();
  }
}

function showResult() {
  document.getElementById('quiz-main').style.display = 'none';
  document.getElementById('quiz-result').style.display = 'block';
  document.getElementById('result-score').textContent = score + ' / ' + questions.length;
  const pct = Math.round(score / questions.length * 100);
  document.getElementById('result-msg').textContent = pct >= 80 ? '훌륭합니다! 🎉' : pct >= 50 ? '좋은 결과입니다!' : '다시 도전해보세요!';
  document.getElementById('result-breakdown').innerHTML = answers.map(a =>
    '<div class="breakdown-item"><span>' + a.q + '</span><span style="color:' + (a.correct ? '#22c55e' : '#ef4444') + '">' + (a.correct ? '정답' : '오답') + '</span></div>'
  ).join('');
}

function resetQuiz() {
  current = 0; score = 0; answers = [];
  document.getElementById('quiz-result').style.display = 'none';
  document.getElementById('quiz-start').style.display = 'block';
}`,
      promptHint: `Layout: quiz-flow
Required sections (in order): 시작 화면(제목+시작버튼), 퀴즈 화면(진행바 + 카운터 + 질문 카드 + 선택지 버튼), 결과 화면(점수 + 오답 요약)
UI patterns: 단일 화면 전환(시작→진행→결과), 선택 시 정답/오답 색상 피드백, 진행바 애니메이션
Must include: 진행바, 정답/오답 즉시 표시, 결과 요약(문제별 정오), 다시 풀기 버튼
Avoid: 그리드 레이아웃, 사이드바, 차트`,
    };
  }
}
