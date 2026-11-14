// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test'
import { publishedJsonSchemas } from './json-schema'

describe('published JSON Schemas', () => {
  // `npx vp test run src/schema -u` regenerates the committed copies.
  for (const [file, schema] of Object.entries(publishedJsonSchemas())) {
    it(`schemas/${file} matches the engine's schema`, async () => {
      await expect(`${JSON.stringify(schema, null, 2)}\n`).toMatchFileSnapshot(
        `../../../schemas/${file}`,
      )
    })
  }
})
