import { createClient } from '@/lib/supabase/server';

export interface FeatureFlags {
  enableDarkMode: boolean;
  enableCodeViewer: boolean;
  enableOllamaFallback: boolean;
  enableTemplateSystem: boolean;
  enableMultiLanguage: boolean;
  enableTeamFeatures: boolean;
  enableAdvancedPrompt: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableDarkMode: false,
  enableCodeViewer: true,
  enableOllamaFallback: false,
  enableTemplateSystem: true,
  enableMultiLanguage: false,
  enableTeamFeatures: false,
  enableAdvancedPrompt: false,
};

let cachedFlags: FeatureFlags | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (cachedFlags && Date.now() < cacheExpiry) {
    return cachedFlags;
  }

  try {
    const supabase = await createClient();
    const { data } = await supabase.from('feature_flags').select('flag_name, enabled');

    if (data && data.length > 0) {
      const flags = { ...DEFAULT_FLAGS };
      for (const row of data) {
        const key = snakeToCamel(row.flag_name) as keyof FeatureFlags;
        if (key in flags) {
          (flags as Record<string, boolean>)[key] = row.enabled;
        }
      }
      cachedFlags = flags;
      cacheExpiry = Date.now() + CACHE_TTL;
      return flags;
    }
  } catch {
    // DB unavailable, use defaults
  }

  return DEFAULT_FLAGS;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
