// src/test/mocks/zustand.ts
import { vi } from 'vitest';
import type { ThemeId } from '@/stores/themeStore';
import type { BuilderMode } from '@/stores/builderModeStore';

export function mockThemeStore(overrides: { theme?: ThemeId; setTheme?: ReturnType<typeof vi.fn> } = {}) {
  return { theme: 'sky' as ThemeId, setTheme: vi.fn(), ...overrides };
}

export function mockBuilderModeStore(overrides: { mode?: BuilderMode; setMode?: ReturnType<typeof vi.fn> } = {}) {
  return { mode: 'api-first' as BuilderMode, setMode: vi.fn(), ...overrides };
}
