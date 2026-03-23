import type { ICodeTemplate } from './ICodeTemplate';
import type { ApiCatalogItem } from '@/types/api';
import { DashboardTemplate } from './DashboardTemplate';
import { CalculatorTemplate } from './CalculatorTemplate';
import { GalleryTemplate } from './GalleryTemplate';

class TemplateRegistryImpl {
  private templates = new Map<string, ICodeTemplate>();

  constructor() {
    this.register(new DashboardTemplate());
    this.register(new CalculatorTemplate());
    this.register(new GalleryTemplate());
  }

  register(template: ICodeTemplate): void {
    this.templates.set(template.id, template);
  }

  unregister(id: string): void {
    this.templates.delete(id);
  }

  get(id: string): ICodeTemplate | undefined {
    return this.templates.get(id);
  }

  getAll(): ICodeTemplate[] {
    return Array.from(this.templates.values());
  }

  /** API 조합에 가장 적합한 템플릿 반환 (임계값 이상만) */
  findBestMatch(apis: ApiCatalogItem[], threshold = 0.3): ICodeTemplate | null {
    let bestTemplate: ICodeTemplate | null = null;
    let bestScore = 0;

    for (const template of this.templates.values()) {
      const score = template.matchScore(apis);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestTemplate = template;
      }
    }

    return bestTemplate;
  }
}

export const templateRegistry = new TemplateRegistryImpl();
