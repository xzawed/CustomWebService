import { describe, it, expect } from 'vitest'
import { parseGeneratedCode, assembleHtml } from './codeParser'

describe('parseGeneratedCode', () => {
  it('HTML 블록을 정상 파싱한다', () => {
    const input = '```html\n<h1>Hello</h1>\n```'
    const result = parseGeneratedCode(input)
    expect(result.html).toBe('<h1>Hello</h1>')
  })

  it('CSS 블록을 정상 파싱한다', () => {
    const input = '```css\nbody { color: red; }\n```'
    const result = parseGeneratedCode(input)
    expect(result.css).toBe('body { color: red; }')
  })

  it('javascript 블록을 정상 파싱한다', () => {
    const input = '```javascript\nconsole.log("hi")\n```'
    const result = parseGeneratedCode(input)
    expect(result.js).toBe('console.log("hi")')
  })

  it('js 블록(단축 표기)을 정상 파싱한다', () => {
    const input = '```js\nconst x = 1\n```'
    const result = parseGeneratedCode(input)
    expect(result.js).toBe('const x = 1')
  })

  it('블록이 없으면 빈 문자열을 반환한다', () => {
    const result = parseGeneratedCode('아무 코드 블록 없는 텍스트')
    expect(result.html).toBe('')
    expect(result.css).toBe('')
    expect(result.js).toBe('')
  })

  it('HTML/CSS/JS 세 블록을 동시에 파싱한다', () => {
    const input = [
      '```html\n<div>test</div>\n```',
      '```css\ndiv { margin: 0; }\n```',
      '```javascript\nconst a = 1;\n```',
    ].join('\n')
    const result = parseGeneratedCode(input)
    expect(result.html).toBe('<div>test</div>')
    expect(result.css).toBe('div { margin: 0; }')
    expect(result.js).toBe('const a = 1;')
  })
})

describe('assembleHtml', () => {
  it('이미 <style>과 <script>가 있는 완전한 HTML은 그대로 반환한다', () => {
    const html = '<html><head><style>a{}</style></head><body><script>var x</script></body></html>'
    const result = assembleHtml({ html, css: 'body{}', js: 'alert()' })
    expect(result).toBe(html)
  })

  it('</head>가 있는 HTML에 CSS를 주입한다', () => {
    const html = '<html><head></head><body></body></html>'
    const result = assembleHtml({ html, css: 'body { color: red; }', js: '' })
    expect(result).toContain('<style>\nbody { color: red; }\n</style>')
    expect(result).toContain('</head>')
  })

  it('</body>가 있는 HTML에 JS를 주입한다', () => {
    const html = '<html><head></head><body></body></html>'
    const result = assembleHtml({ html, css: '', js: 'const x = 1;' })
    expect(result).toContain('<script>\nconst x = 1;\n</script>')
    expect(result).toContain('</body>')
  })

  it('HTML이 없으면 완전한 문서 구조를 생성한다', () => {
    const result = assembleHtml({ html: '<p>content</p>', css: 'p{}', js: 'var a=1' })
    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<html lang="ko">')
    expect(result).toContain('<p>content</p>')
  })
})
