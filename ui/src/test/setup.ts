// SPDX-License-Identifier: MIT

import * as matchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vite-plus/test'
import '@/i18n'

expect.extend(matchers)

type TestGlobal = typeof globalThis & { ResizeObserver?: typeof ResizeObserver }
const testGlobal = globalThis as TestGlobal
if (typeof testGlobal.ResizeObserver === 'undefined') {
  testGlobal.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver
}

// jsdom has no idle callbacks; the editor defers its warm-up work to them.
if (typeof window !== 'undefined' && typeof window.requestIdleCallback !== 'function') {
  window.requestIdleCallback = ((callback: IdleRequestCallback) =>
    window.setTimeout(
      () => callback({ didTimeout: false, timeRemaining: () => 0 }),
      1,
    )) as typeof window.requestIdleCallback
  window.cancelIdleCallback = (id: number) => window.clearTimeout(id)
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
