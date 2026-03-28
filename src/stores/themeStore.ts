import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'sky' | 'lavender' | 'mint' | 'peach' | 'rose' | 'dusk';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  emoji: string;
  desc: string;
  /** CSS gradient for the swatch preview */
  swatch: string;
  /** Whether this is a dark theme */
  dark?: boolean;
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'sky',
    label: '하늘',
    emoji: '☁️',
    desc: '맑고 깨끗한',
    swatch: 'linear-gradient(135deg, #6366f1, #818cf8, #a5b4fc)',
  },
  {
    id: 'lavender',
    label: '라벤더',
    emoji: '💜',
    desc: '우아하고 창의적인',
    swatch: 'linear-gradient(135deg, #7c3aed, #a78bfa, #c4b5fd)',
  },
  {
    id: 'mint',
    label: '민트',
    emoji: '🌿',
    desc: '신선하고 자연스러운',
    swatch: 'linear-gradient(135deg, #059669, #10b981, #34d399)',
  },
  {
    id: 'peach',
    label: '피치',
    emoji: '🍑',
    desc: '따뜻하고 활기찬',
    swatch: 'linear-gradient(135deg, #ea580c, #f97316, #fb923c)',
  },
  {
    id: 'rose',
    label: '로즈',
    emoji: '🌹',
    desc: '로맨틱하고 포근한',
    swatch: 'linear-gradient(135deg, #e11d48, #f43f5e, #fb7185)',
  },
  {
    id: 'dusk',
    label: '다크',
    emoji: '🌙',
    desc: '밤의 깊은 감성',
    swatch: 'linear-gradient(135deg, #060912, #0d1117, #141c2e)',
    dark: true,
  },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'sky',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'cws-theme' }
  )
);
