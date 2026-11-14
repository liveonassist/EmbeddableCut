// SPDX-License-Identifier: MIT
//
// The edit operations as JSON Schema, for clients that build op logs without
// this code (a Flutter app, a backend). Generated from the zod schemas the
// service validates with; `UPDATE_SCHEMAS=1 node --test schemas.test.mjs`
// regenerates the committed copy in schemas/.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { z } from 'zod'
import { HEADLESS_API_VERSION, editOpSchema } from './lib/contract.mjs'

const FILE = path.join(
  import.meta.dirname,
  '..',
  'schemas',
  `edit-operation.v${HEADLESS_API_VERSION}.schema.json`,
)

function generate() {
  const generated = z.toJSONSchema(editOpSchema, {
    target: 'draft-2020-12',
    io: 'input',
    unrepresentable: 'any',
  })
  const schema = {
    $schema: generated.$schema,
    $id: `urn:embeddablecut:schema:edit-operation:v${HEADLESS_API_VERSION}`,
    title: 'EmbeddableCut edit operation',
    ...generated,
  }
  return `${JSON.stringify(schema, null, 2)}\n`
}

test('schemas/ has the edit operations the service accepts', () => {
  const expected = generate()
  if (process.env.UPDATE_SCHEMAS) fs.writeFileSync(FILE, expected)
  assert.equal(
    fs.readFileSync(FILE, 'utf8'),
    expected,
    `stale ${FILE}: run UPDATE_SCHEMAS=1 node --test schemas.test.mjs`,
  )
})
