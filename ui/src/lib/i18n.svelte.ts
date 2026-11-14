// SPDX-License-Identifier: MIT

/** The engine's i18next, read reactively: `t(key)` re-renders when the language or resources change. */

import { i18n } from '@/i18n'

let version = $state(0)
const bump = () => {
  version++
}
i18n.on('languageChanged', bump)
i18n.on('loaded', bump)
i18n.store?.on('added', bump)

export function t(key: string, options?: Record<string, unknown>): string {
  void version
  return i18n.t(key, options) as string
}

export const locale = {
  get current(): string {
    void version
    return i18n.resolvedLanguage ?? i18n.language
  },
}

export { i18n }
