import type { ICodeTemplate, TemplateContext, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';

export class CalculatorTemplate implements ICodeTemplate {
  readonly id = 'calculator';
  readonly name = '계산기/변환기';
  readonly description = '값 입력 시 실시간 계산/변환 도구';
  readonly category = 'tool';
  readonly supportedApiCategories = ['환율', '단위', '계산', 'currency', 'exchange', 'convert'];

  matchScore(apis: ApiCatalogItem[]): number {
    const matchingApis = apis.filter((api) =>
      this.supportedApiCategories.some(
        (cat) =>
          api.category.toLowerCase().includes(cat.toLowerCase()) ||
          api.name.toLowerCase().includes(cat.toLowerCase()) ||
          api.description.toLowerCase().includes(cat.toLowerCase())
      )
    );
    return apis.length > 0 ? matchingApis.length / apis.length : 0;
  }

  generate(context: TemplateContext): TemplateOutput {
    const apiName = context.apis[0]?.name ?? 'API';

    return {
      html: `<div class="converter">
    <header>
      <h1>변환기</h1>
      <p>${context.userContext.slice(0, 80)}</p>
    </header>
    <div class="converter-body">
      <div class="input-group">
        <label for="input-value">입력값</label>
        <input type="number" id="input-value" placeholder="값을 입력하세요" />
        <select id="input-unit">
          <option value="default">선택</option>
        </select>
      </div>
      <div class="arrow">→</div>
      <div class="input-group">
        <label for="output-value">결과</label>
        <input type="text" id="output-value" readonly />
        <select id="output-unit">
          <option value="default">선택</option>
        </select>
      </div>
    </div>
    <button id="convert-btn" onclick="convert()">변환</button>
    <div class="history" id="history">
      <h3>변환 히스토리</h3>
      <ul id="history-list"></ul>
    </div>
  </div>`,
      css: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; justify-content: center; align-items: center; }
.converter { background: white; border-radius: 16px; padding: 2.5rem; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 500px; width: 100%; }
header h1 { font-size: 1.5rem; font-weight: 700; color: #1e293b; }
header p { color: #64748b; font-size: 0.875rem; margin-top: 0.25rem; margin-bottom: 1.5rem; }
.converter-body { display: flex; align-items: end; gap: 1rem; }
.arrow { font-size: 1.5rem; color: #94a3b8; padding-bottom: 0.5rem; }
.input-group { flex: 1; }
.input-group label { display: block; font-size: 0.75rem; font-weight: 600; color: #475569; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em; }
.input-group input, .input-group select { width: 100%; padding: 0.625rem; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 1rem; outline: none; }
.input-group input:focus, .input-group select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
#convert-btn { width: 100%; margin-top: 1.5rem; padding: 0.75rem; background: #3b82f6; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; }
#convert-btn:hover { background: #2563eb; }
.history { margin-top: 2rem; border-top: 1px solid #e2e8f0; padding-top: 1rem; }
.history h3 { font-size: 0.875rem; color: #475569; margin-bottom: 0.5rem; }
#history-list { list-style: none; }
#history-list li { padding: 0.5rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.8rem; color: #64748b; }`,
      js: `const history = [];

async function convert() {
  const inputVal = document.getElementById('input-value').value;
  if (!inputVal) return;

  const inputUnit = document.getElementById('input-unit').value;
  const outputUnit = document.getElementById('output-unit').value;

  try {
    // ${apiName} API 호출
    const result = parseFloat(inputVal); // placeholder: 실제 API 응답으로 교체
    document.getElementById('output-value').value = result;

    history.unshift({ input: inputVal + ' ' + inputUnit, output: result + ' ' + outputUnit, time: new Date().toLocaleTimeString('ko-KR') });
    renderHistory();
  } catch (err) {
    document.getElementById('output-value').value = '오류 발생';
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = history.slice(0, 10).map(h =>
    '<li>' + h.input + ' → ' + h.output + ' <span style="float:right">' + h.time + '</span></li>'
  ).join('');
}

document.getElementById('input-value').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') convert();
});`,
      promptHint:
        '이 계산기/변환기 템플릿을 기반으로, 선택된 API에 맞는 단위/환율 옵션을 추가하고, 실제 API 호출로 변환 로직을 구현해주세요.',
    };
  }
}
