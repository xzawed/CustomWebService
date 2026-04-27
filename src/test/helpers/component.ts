// src/test/helpers/component.ts
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

export function renderComponent(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options);
}

export * from '@testing-library/react';
