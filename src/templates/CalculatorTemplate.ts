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
    const _apiUrl = "${context.apis[0]?.authType !== 'none'
      ? '/api/v1/proxy?apiId=' + (context.apis[0]?.id ?? '') + '&proxyPath=' + encodeURIComponent(context.apis[0]?.endpoints[0]?.path ?? '/convert')
      : (context.apis[0]?.baseUrl ?? 'https://api.example.com') + (context.apis[0]?.endpoints[0]?.path ?? '/convert')}";
    const _params = new URLSearchParams({ amount: inputVal, from: inputUnit, to: outputUnit });
    const _res = await fetch(_apiUrl + '&' + _params.toString());
    if (!_res.ok) throw new Error('HTTP ' + _res.status);
    const _json = await _res.json();
    const _raw = _json${context.apis[0]?.endpoints[0]?.responseDataPath ? '.' + context.apis[0].endpoints[0].responseDataPath : ''} ?? _json;
    const result = typeof _raw === 'number' ? _raw : (_raw.result ?? _raw.value ?? _raw.converted ?? _raw.rate ?? parseFloat(String(_raw)));
    document.getElementById('output-value').value = isNaN(result) ? JSON.stringify(_raw).slice(0, 80) : result;

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
        `Layout: input-result-tool
Required sections (in order): 제목/설명 헤더, 입력폼(숫자 입력 + 단위 선택), 화살표/결과 영역, 변환 히스토리 목록
UI patterns: 중앙 정렬 단일 카드, 큰 입력 필드, 명확한 변환 방향 표시
State management: x-data="{ inputValue: '', inputUnit: '', outputValue: '', outputUnit: '', loading: false, history: [] }" — x-model for inputs and selects
Inputs: x-model="inputValue" on number input, x-model="inputUnit" on from-unit select, x-model="outputUnit" on to-unit select
Action: @click="convert()" on convert button, @keydown.enter="convert()" on input field
Loading: x-show="loading" spinner, :disabled="loading" on button
History: x-show="history.length > 0" list rendered with x-for="item in history"
Must include: Alpine.js CDN, Enter 키 변환 지원, 히스토리 항목 최소 5개, API 로딩 상태 표시, DOMContentLoaded API fetch(), no hardcoded conversion values
Avoid: 복수 탭, 지도/차트, 마케팅 섹션`,
    };
  }
}
