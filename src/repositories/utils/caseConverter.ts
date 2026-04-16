/**
 * Converts a camelCase string to snake_case.
 * Handles sequences like "HTMLParser" → "html_parser", "deployURL" → "deploy_url".
 */
export function toSnake(str: string): string {
  return str
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}
