export interface BuilderStepDefinition {
  id: string;
  label: string;
  order: number;
  canProceed: (state: StepState) => boolean;
}

export interface StepState {
  selectedApiCount: number;
  contextLength: number;
  contextMinLength: number;
  generationStatus: string;
}

const steps: BuilderStepDefinition[] = [
  {
    id: 'api-select',
    label: 'API 선택',
    order: 1,
    canProceed: (state) => state.selectedApiCount > 0,
  },
  {
    id: 'context',
    label: '서비스 설명',
    order: 2,
    canProceed: (state) => state.contextLength >= state.contextMinLength,
  },
  {
    id: 'generate',
    label: '생성',
    order: 3,
    canProceed: () => true,
  },
];

export function getSteps(): BuilderStepDefinition[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

export function registerStep(step: BuilderStepDefinition): void {
  const existing = steps.findIndex((s) => s.id === step.id);
  if (existing >= 0) {
    steps[existing] = step;
  } else {
    steps.push(step);
  }
}
