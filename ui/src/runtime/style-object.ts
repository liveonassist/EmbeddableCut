// SPDX-License-Identifier: MIT

/**
 * React's `style={{ ... }}` objects, for the composition runtime's computed
 * styles. `styleToString` serializes one the way React DOM applies it:
 * camelCase names become kebab-case, vendor prefixes gain their leading dash,
 * custom properties pass through, numbers get `px` except on the properties
 * React treats as unitless, and `null`, `undefined`, `false` and `''` values
 * are dropped.
 */

export type CSSProperties = Record<string, string | number | null | undefined | false>

const UNITLESS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
])

const nameCache = new Map<string, string>()

function cssName(name: string): string {
  if (name.startsWith('--')) return name
  let cached = nameCache.get(name)
  if (cached === undefined) {
    cached = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    if (/^(webkit|moz|ms|o)-/.test(cached)) cached = `-${cached}`
    nameCache.set(name, cached)
  }
  return cached
}

function isUnitless(name: string): boolean {
  if (UNITLESS.has(name)) return true
  const unprefixed = name.replace(/^(Webkit|Moz|ms|O)/, '')
  return UNITLESS.has(unprefixed.charAt(0).toLowerCase() + unprefixed.slice(1))
}

function cssValue(name: string, value: string | number): string {
  if (typeof value !== 'number' || value === 0 || name.startsWith('--')) return String(value)
  return isUnitless(name) ? String(value) : `${value}px`
}

function isEmpty(value: CSSProperties[string]): value is null | undefined | false | '' {
  return value === null || value === undefined || value === false || value === ''
}

/**
 * Applies `next` to `node` property by property, as React DOM patches a
 * `style` object: only changed properties are written and dropped ones
 * removed, so properties set imperatively elsewhere (a drag's `translate`)
 * survive. Returns `next`, to pass as `previous` on the following call.
 */
export function patchStyle(
  node: HTMLElement,
  previous: CSSProperties | null,
  next: CSSProperties,
): CSSProperties {
  if (previous) {
    for (const name in previous) {
      if (!isEmpty(previous[name]) && isEmpty(next[name])) {
        node.style.removeProperty(cssName(name))
      }
    }
  }
  for (const name in next) {
    const value = next[name]
    if (isEmpty(value) || previous?.[name] === value) continue
    node.style.setProperty(cssName(name), cssValue(name, value))
  }
  return next
}

/** Serializes a React-style object to a `style` attribute string. */
export function styleToString(style: CSSProperties | null | undefined): string {
  if (!style) return ''
  const parts: string[] = []
  for (const name in style) {
    const value = style[name]
    if (value === null || value === undefined || value === false || value === '') continue
    parts.push(`${cssName(name)}: ${cssValue(name, value)};`)
  }
  return parts.join(' ')
}
