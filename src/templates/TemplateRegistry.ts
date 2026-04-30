import type { ICodeTemplate } from './ICodeTemplate';
import { DashboardTemplate } from './DashboardTemplate';
import { CalculatorTemplate } from './CalculatorTemplate';
import { GalleryTemplate } from './GalleryTemplate';
import { InfoLookupTemplate } from './InfoLookupTemplate';
import { MapServiceTemplate } from './MapServiceTemplate';
import { ContentFeedTemplate } from './ContentFeedTemplate';
import { ComparisonTemplate } from './ComparisonTemplate';
import { TimelineTemplate } from './TimelineTemplate';
import { NewsCuratorTemplate } from './NewsCuratorTemplate';
import { QuizTemplate } from './QuizTemplate';
import { ProfileTemplate } from './ProfileTemplate';

class TemplateRegistryImpl {
  private templates = new Map<string, ICodeTemplate>();

  constructor() {
    this.register(new DashboardTemplate());
    this.register(new CalculatorTemplate());
    this.register(new GalleryTemplate());
    this.register(new InfoLookupTemplate());
    this.register(new MapServiceTemplate());
    this.register(new ContentFeedTemplate());
    this.register(new ComparisonTemplate());
    this.register(new TimelineTemplate());
    this.register(new NewsCuratorTemplate());
    this.register(new QuizTemplate());
    this.register(new ProfileTemplate());
  }

  register(template: ICodeTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): ICodeTemplate | undefined {
    return this.templates.get(id);
  }
}

export const templateRegistry = new TemplateRegistryImpl();
