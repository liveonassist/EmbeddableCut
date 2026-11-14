// SPDX-License-Identifier: MIT

import type { Component } from 'svelte'
import TextStub from './text.stub.svelte'

/** A test stand-in component that renders `text` and ignores its props. */
export function textStub(text: string, onRender?: (props: Record<string, unknown>) => void) {
  const stub = (anchor: unknown, props: Record<string, unknown>) => {
    onRender?.(props)
    return (TextStub as unknown as (anchor: unknown, props: { text: string }) => unknown)(anchor, {
      text,
    })
  }
  return stub as unknown as Component<Record<string, unknown>>
}
