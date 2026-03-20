import ko from './locales/ko.json';

type NestedRecord = { [key: string]: string | NestedRecord };

const translations: Record<string, NestedRecord> = {
  ko,
};

let currentLocale = 'ko';

export function setLocale(locale: string) {
  if (translations[locale]) {
    currentLocale = locale;
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.');
  let value: unknown = translations[currentLocale];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = (value as Record<string, unknown>)[k];
    } else {
      return key; // Return key if not found
    }
  }

  if (typeof value !== 'string') return key;

  if (params) {
    return value.replace(/\{(\w+)\}/g, (_, paramKey) =>
      params[paramKey] !== undefined ? String(params[paramKey]) : `{${paramKey}}`
    );
  }

  return value;
}
