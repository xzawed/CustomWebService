/** HTML 문자열에서 <title>...</title> 내용을 추출. 없으면 undefined 반환. */
export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (!match) return undefined;
  return match[1].trim();
}
