// SPDX-License-Identifier: MIT

import type { DocPage } from '../docs-content'

/** Free-text haystack for a page, used by the sidebar search filter. */
export function pageSearchText(page: DocPage): string {
  const parts = [page.title, page.description]
  for (const section of page.sections) {
    parts.push(section.title)
    if (section.items) parts.push(...section.items)
    for (const block of section.blocks ?? []) {
      if (block.kind === 'paragraph' || block.kind === 'note') parts.push(block.text)
      else if (block.kind === 'list' || block.kind === 'steps') parts.push(...block.items)
      else if (block.kind === 'table') parts.push(...block.headers, ...block.rows.flat())
      else if (block.kind === 'figure') {
        parts.push(block.figure.alt)
        if (block.figure.caption) parts.push(block.figure.caption)
      }
    }
  }
  return parts.join(' ').toLowerCase()
}

/** Splits a doc string into its `**bold**`, `` `code` ``, `[text](page-slug)` and plain tokens. */
export function richTextTokens(text: string): string[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean)
}
