// SPDX-License-Identifier: MIT

/**
 * JSON Schema for the portable formats, for clients that don't run this
 * TypeScript (Flutter, server-side validators). Generated from the zod schemas
 * the engine validates with, so the two can't disagree; the committed copies
 * in `schemas/` at the repo root are checked against these by
 * `json-schema.test.ts` (`npx vp test run src/schema -u` regenerates them).
 */

import { z } from "zod";
import { assetRecordSchema } from "./asset";
import { projectDocumentSchema } from "./project-document";
import { ASSET_SCHEMA_VERSION, PROJECT_DOCUMENT_SCHEMA_VERSION } from "./versions";

function toJsonSchema(schema: z.ZodType, id: string, title: string): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    io: "input",
    unrepresentable: "any",
  });
  return { $schema: generated.$schema, $id: id, title, ...generated };
}

/** Every published JSON Schema, keyed by its file name under `schemas/`. */
export function publishedJsonSchemas(): Record<string, Record<string, unknown>> {
  return {
    [`project-document.v${PROJECT_DOCUMENT_SCHEMA_VERSION}.schema.json`]: toJsonSchema(
      projectDocumentSchema,
      `urn:embeddablecut:schema:project-document:v${PROJECT_DOCUMENT_SCHEMA_VERSION}`,
      "EmbeddableCut project document",
    ),
    [`asset.v${ASSET_SCHEMA_VERSION}.schema.json`]: toJsonSchema(
      assetRecordSchema,
      `urn:embeddablecut:schema:asset:v${ASSET_SCHEMA_VERSION}`,
      "EmbeddableCut media asset record",
    ),
  };
}
