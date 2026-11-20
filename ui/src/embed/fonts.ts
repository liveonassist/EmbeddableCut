// SPDX-License-Identifier: MIT

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap'

/**
 * Loads IBM Plex into the page, once. Font faces can't be declared inside a
 * shadow root, so an embedded editor adds them to its host's document, as it
 * does its stylesheet's `@property` rules (`ensurePropertyRules`).
 */
export function ensureEditorFonts(): void {
  if (document.querySelector(`link[href="${FONTS_HREF}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = FONTS_HREF
  link.crossOrigin = 'anonymous'
  document.head.append(link)
}
