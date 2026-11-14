// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { styleToString } from './style-object'

describe('styleToString', () => {
  it('serializes as React DOM applies style objects', () => {
    expect(
      styleToString({
        position: 'absolute',
        top: 0,
        width: 120.5,
        zIndex: 3,
        opacity: 0.5,
        WebkitMaskImage: 'none',
        WebkitLineClamp: 2,
        '--tile': 4,
        visibility: undefined,
        transform: '',
      }),
    ).toBe(
      'position: absolute; top: 0; width: 120.5px; z-index: 3; opacity: 0.5; -webkit-mask-image: none; -webkit-line-clamp: 2; --tile: 4;',
    )
  })
})
