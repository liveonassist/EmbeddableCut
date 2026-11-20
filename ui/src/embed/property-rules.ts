// SPDX-License-Identifier: MIT

const registered = new WeakSet<Document>()

/**
 * Registers the stylesheet's `@property` rules on the page, once. Chrome
 * ignores `@property` inside a shadow root, and Tailwind's utilities lean on
 * the defaults those rules give: without them `border` draws no border,
 * `shadow-*` no shadow, `translate-*` doesn't move and `after:` renders no
 * pseudo-element. The rules only declare `--tw-*` custom properties, the same
 * declarations a Tailwind page registers itself.
 */
export function ensurePropertyRules(sheet: CSSStyleSheet): void {
  if (registered.has(document)) return
  const rules = Array.from(sheet.cssRules)
    .filter((rule) => rule instanceof CSSPropertyRule)
    .map((rule) => rule.cssText)
  if (rules.length === 0) return
  const properties = new CSSStyleSheet()
  properties.replaceSync(rules.join('\n'))
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, properties]
  registered.add(document)
}
