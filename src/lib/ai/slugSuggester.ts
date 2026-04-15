import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { toSlug, isValidSlug } from '@/lib/utils/slugify';
import { logger } from '@/lib/utils/logger';

export interface SlugSuggestInput {
  context: string;           // 사용자 입력 서비스 설명
  pageTitle?: string;        // 생성된 HTML의 <title> (힌트)
  categoryHints?: string[];  // 선택된 API 카테고리
}

/** AI 영문 slug 후보 최대 3개. 실패 시 빈 배열(폴백 트리거) */
export async function suggestSlugs(input: SlugSuggestInput): Promise<string[]> {
  try {
    const provider = AiProviderFactory.createForTask('suggestion');

    const userParts: string[] = [`Service description: ${input.context}`];
    if (input.pageTitle) {
      userParts.push(`Page title: ${input.pageTitle}`);
    }
    if (input.categoryHints && input.categoryHints.length > 0) {
      userParts.push(`Categories: ${input.categoryHints.join(', ')}`);
    }
    userParts.push('\nReturn a JSON array of exactly 3 slug suggestions.');

    const aiResponse = await provider.generateCode({
      system: `You are a URL slug generator for web services.
Given a service description, generate exactly 3 English kebab-case URL slugs.
Rules:
- Each slug must be 3–40 characters long
- Only lowercase letters (a-z), digits (0-9), and hyphens (-)
- Must start and end with a letter or digit (no leading/trailing hyphens)
- Do not use reserved words like: admin, dashboard, login, api, www, auth, settings, profile, help, support, blog, docs, status, health
- Each slug must be unique and reflect the service content
- Return ONLY a raw JSON array, no markdown, no code blocks, no explanation
Example output: ["my-weather-app", "weather-dashboard", "daily-forecast"]`,
      user: userParts.join('\n'),
      temperature: 0.7,
      maxTokens: 200,
    });

    const match = aiResponse.content.match(/\[[\s\S]*?\]/);
    if (!match) {
      logger.warn('slugSuggester: could not find JSON array in AI response', {
        content: aiResponse.content.slice(0, 200),
      });
      return [];
    }

    let parsed: unknown[];
    try {
      const raw = JSON.parse(match[0]);
      if (!Array.isArray(raw)) throw new Error('Not an array');
      parsed = raw;
    } catch {
      logger.warn('slugSuggester: JSON parse failed', { raw: match[0].slice(0, 200) });
      return [];
    }

    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of parsed) {
      if (result.length >= 3) break;
      const normalized = toSlug(String(item)).slice(0, 50);
      if (!normalized || !isValidSlug(normalized)) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
    }

    return result;
  } catch (err) {
    logger.warn('slugSuggester: unexpected error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
