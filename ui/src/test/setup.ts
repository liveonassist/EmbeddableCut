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
