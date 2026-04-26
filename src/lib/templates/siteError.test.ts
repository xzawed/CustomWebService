import { describe, it, expect } from 'vitest';
import { notFoundHtml, preparingHtml } from './siteError';

describe('notFoundHtml', () => {
  it('contains 404 and the slug', () => {
    const html = notFoundHtml('my-slug');
    expect(html).toContain('404');
    expect(html).toContain('my-slug');
  });

  it('contains DOCTYPE and html structure', () => {
    const html = notFoundHtml('test');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html');
    expect(html).toContain('</html>');
  });

  it('escapes XSS: <script> tag', () => {
    const html = notFoundHtml('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes XSS: double quotes', () => {
    const html = notFoundHtml('"hello"');
    expect(html).toContain('&quot;hello&quot;');
    expect(html).not.toContain('"hello"');
  });

  it("escapes XSS: apostrophe in it's", () => {
    const html = notFoundHtml("it's");
    expect(html).toContain('&#39;s');
  });
});

describe('preparingHtml', () => {
  it('contains the slug and 준비 중', () => {
    const html = preparingHtml('my-slug');
    expect(html).toContain('my-slug');
    expect(html).toContain('준비 중');
  });

  it('has meta http-equiv="refresh" for auto-refresh', () => {
    const html = preparingHtml('test');
    expect(html).toContain('http-equiv="refresh"');
  });

  it('escapes XSS: <img src=x>', () => {
    const html = preparingHtml('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
  });
});
