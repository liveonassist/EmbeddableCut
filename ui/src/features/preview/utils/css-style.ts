// SPDX-License-Identifier: MIT

/**
 * React-style inline style objects for the places FreeCut builds styles as
 * values (spread together, returned from helpers, passed as props). Keys are
 * camelCase or custom properties; numbers get `px` except on React's unitless
 * properties, exactly as React DOM serializes them.
 */
export type CssStyleObject = Record<string, string | number | null | undefined>

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

function cssName(key: string): string {
  if (key.startsWith('--')) return key
  const kebab = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
  return /^(webkit|moz|ms)-/.test(kebab) ? `-${kebab}` : kebab
}

/** Serialize a style object to a `style` attribute string. */
export function cssStyle(style: CssStyleObject | null | undefined): string {
  if (!style) return ''
  let out = ''
  for (const key in style) {
    const value = style[key]
    if (value === null || value === undefined || value === '' || typeof value === 'boolean')
      continue
    const text =
      typeof value === 'number' && value !== 0 && !UNITLESS.has(key) && !key.startsWith('--')
        ? `${value}px`
        : String(value)
    out += `${cssName(key)}: ${text}; `
  }
  return out.trimEnd()
}
