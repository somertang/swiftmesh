import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const HTML_TAG_RE =
  /<\/?(?:h[1-6]|p|ul|ol|li|a|div|br|strong|em|b|i|table|thead|tbody|tr|td|th|blockquote|pre|code|hr|img|span|section|details|summary)\b/i

let linkHookInstalled = false

function ensureLinkHook() {
  if (linkHookInstalled) return
  linkHookInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName !== 'A') return
    const href = node.getAttribute('href') || ''
    if (!/^https?:\/\//i.test(href)) {
      node.removeAttribute('href')
      return
    }
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  })
}

function looksLikeHtml(source: string): boolean {
  return HTML_TAG_RE.test(source)
}

/** Turn release-note HTML or Markdown into sanitized HTML for dialog display. */
export function formatReleaseNotesHtml(source: string): string {
  const trimmed = source.trim()
  if (!trimmed) return ''

  ensureLinkHook()

  const rawHtml = looksLikeHtml(trimmed)
    ? trimmed
    : String(marked.parse(trimmed, { async: false }))

  return DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  })
}
