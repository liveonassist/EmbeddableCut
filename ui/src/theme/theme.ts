// SPDX-License-Identifier: MIT

/**
 * The editor's theme: FreeCut's dark default, a light theme, or the system's
 * choice, plus overrides of any semantic token. Applied to the editor's root
 * element (or shadow host), so each mounted editor is themed on its own and
 * nothing leaks into the host page.
 */

/** The semantic tokens `styles/app.css` defines; set them without the `--`. */
export const THEME_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'panel-bg',
  'panel-header',
  'timeline-bg',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'radius',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]
export type ThemeMode = 'dark' | 'light' | 'system'

export interface Theme {
  mode?: ThemeMode
  /** CSS values for tokens, e.g. `{ primary: 'oklch(0.7 0.15 250)' }`. */
  tokens?: Partial<Record<ThemeToken, string>>
}

const TOKEN_SET = new Set<string>(THEME_TOKENS)

/** Applies themes to one element; `setTheme` can be called any time. */
export class ThemeController {
  private media: MediaQueryList | null = null
  private readonly onSystemChange = () => this.paint()
  private theme: Theme = { mode: 'dark' }

  constructor(private readonly element: HTMLElement) {}

  setTheme(theme: ThemeMode | Theme | Record<string, string>): void {
    if (typeof theme === 'string') this.theme = { ...this.theme, mode: theme }
    else if ('mode' in theme || 'tokens' in theme) this.theme = theme as Theme
    else this.theme = { ...this.theme, tokens: theme as Theme['tokens'] }
    const wantsSystem = this.theme.mode === 'system'
    if (wantsSystem && !this.media && typeof matchMedia === 'function') {
      this.media = matchMedia('(prefers-color-scheme: light)')
      this.media.addEventListener('change', this.onSystemChange)
    } else if (!wantsSystem && this.media) {
      this.media.removeEventListener('change', this.onSystemChange)
      this.media = null
    }
    this.paint()
  }

  /** The mode in effect: `system` resolved. */
  get mode(): 'dark' | 'light' {
    if (this.theme.mode === 'system') return this.media?.matches ? 'light' : 'dark'
    return this.theme.mode ?? 'dark'
  }

  private paint(): void {
    this.element.dataset.theme = this.mode
    for (const token of THEME_TOKENS) this.element.style.removeProperty(`--${token}`)
    for (const [token, value] of Object.entries(this.theme.tokens ?? {})) {
      if (TOKEN_SET.has(token) && value) this.element.style.setProperty(`--${token}`, value)
    }
  }

  dispose(): void {
    this.media?.removeEventListener('change', this.onSystemChange)
  }
}
