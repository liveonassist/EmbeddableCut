// SPDX-License-Identifier: MIT
// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { writeBundle } from './bundle'

describe('writeBundle', () => {
  it("records each entry's CRC-32, which a reader checks the bytes against", async () => {
    // The document's JSON is "123456789", CRC-32's check value.
    const bundle = await writeBundle({ document: 123456789, media: new Map() })
    const view = new DataView(await bundle.arrayBuffer())

    expect(view.getUint32(14, true)).toBe(0xcbf43926)
  })
})
