import type { ApiCatalogItem } from '@/types/api';

export interface TemplateContext {
  apis: ApiCatalogItem[];
  userContext: string;
  templateId: string;
}

export interface TemplateOutput {
  html: string;
  css: string;
  js: string;
  promptHint: string; // AI에게 전달할 추가 힌트
}

export interface ICodeTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly supportedApiCategories: string[];

  /** 이 템플릿이 주어진 API 조합에 적합한지 판단 (0~1 점수) */
  matchScore(apis: ApiCatalogItem[]): number;

  /** 기본 코드 골격 생성 */
  generate(context: TemplateContext): TemplateOutput;
}
