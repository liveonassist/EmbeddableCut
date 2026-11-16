# Schemas

JSON Schema (draft 2020-12) for EmbeddableCut's portable formats, generated from the zod schemas that validate them. Don't edit these by hand: change the zod schema in `engine/src/schema/`, then run `npx vp test run src/schema -u` in `engine/`.

- `project-document.v1.schema.json` — a project with its asset records and required extensions.
- `asset.v1.schema.json` — one media asset record.
- `edit-operation.v1.schema.json` — one edit operation, as the render service and the SDK apply it. Generated from `render/lib/contract.mjs` (`UPDATE_SCHEMAS=1 node --test schemas.test.mjs` in `render/`); its version is the render API's.

[`docs/SCHEMAS.md`](../docs/SCHEMAS.md) is the versioning and migration policy every reader follows.
