# Schemas

Every format EmbeddableCut persists or exchanges has one owner, an explicit version, a schema it's validated against, and a migration from each version before. This page is the policy; `engine/src/schema/` is the code.

## The formats

| Format | Version | Owner | Where it lives |
| --- | --- | --- | --- |
| Project (`project.json`) | integer, `project.schemaVersion` | FreeCut: `engine/src/shared/projects/migrations/` | the workspace, and inside every project document |
| Project document | integer, `schemaVersion` | EmbeddableCut: `engine/src/schema/project-document.ts` | the SDK's load and save, the render API, other clients |
| Asset record | integer, versioned with the document | EmbeddableCut: `engine/src/schema/asset.ts` | a project document's `assets` |
| Edit operation | the render API's `apiVersion` | FreeCut: `render/lib/contract.mjs` | the SDK's `apply`, the service's `/edit`, the bridge |
| Bridge messages | `BRIDGE_VERSION` | EmbeddableCut: `sdk/src/bridge/protocol.ts` | iframe and WebView hosts ([`BRIDGE.md`](BRIDGE.md)) |
| Workspace layout | `"2.0"` in `.freecut-workspace.json` | FreeCut: `engine/src/infrastructure/storage/workspace-fs/` | the workspace folder |
| Bundle manifest (`.freecut.zip`) | `"1.0"` | FreeCut: `engine/src/features/project-bundle/` | project bundles |
| JSON snapshot | `"1.0"` | FreeCut: `engine/src/features/project-bundle/` | FreeCut's JSON export |
| Render API | `apiVersion`, `HEADLESS_API_VERSION` | FreeCut: `render/lib/contract.mjs` | the HTTP service's requests and responses; EmbeddableCut's additions are announced in `/v1/capabilities` |

`SCHEMA_VERSIONS` in `engine/src/schema/versions.ts` lists the current version of each data format in one place.

### The project document

The project document is the portable format: a FreeCut project, the asset record for every media item it references, and the extensions it can't render faithfully without.

```json
{
  "format": "embeddablecut.project",
  "schemaVersion": 1,
  "project": { "id": "…", "schemaVersion": 15, "metadata": { "width": 1920, "height": 1080, "fps": 30 }, "timeline": { "…": "…" } },
  "assets": [{ "id": "…", "fileName": "clip.mp4", "mimeType": "video/mp4", "source": { "type": "url", "url": "https://…" }, "…": "…" }],
  "requires": [{ "kind": "effect", "id": "acme.glow" }]
}
```

It carries two versions on purpose. The envelope's `schemaVersion` is EmbeddableCut's; `project.schemaVersion` is FreeCut's, which moves whenever upstream adds a migration. Keeping them apart means an upstream release never renumbers the envelope, and a change to the envelope never collides with upstream's numbering.

The editor's workspace keeps FreeCut's layout: `project.json` per project and `metadata.json` per media. A document is assembled from those, and taken apart into them.

JSON Schema for each portable format is generated from the zod schema the engine validates with and committed in [`schemas/`](../schemas), for clients that don't run TypeScript. A test fails when the committed copy drifts; `npx vp test run src/schema -u` in `engine/` regenerates it.

## Versions

- **Data versions are not package versions.** A format's version counts changes to that data, nothing else. The SDK's semver, the render API's `apiVersion` and a format's `schemaVersion` move independently: an SDK release that writes the same data keeps every schema version.
- **Every change to a format bumps its version,** additive ones included, so a reader knows exactly what it's reading. One change, one bump, one migration.
- **A version has one owner,** the module in the table above. Only that module defines the version, the schema and the migrations.
- **No implicit versions.** Everything new is written with its version. FreeCut's projects from before `schemaVersion` existed are read as version 1, the one exception, and are written back versioned.

## Reading

- **Older versions are migrated** forward step by step, each migration a pure function from version N to N+1 (`shared/projects/migrations/migrations.ts`), then normalized.
- **Newer versions are refused** with `SCHEMA_TOO_NEW` (`ProjectSchemaTooNewError` for a bare project). Reading what it can and saving it back would silently drop what the newer version added, so an older engine never opens one.
- **Then the whole is validated.** A document that doesn't match its schema is refused with `SCHEMA_INVALID` and the paths of what's wrong. Nothing is partially read.
- **Unknown fields are errors, not losses.** The document, its project and its assets are strict, so a misspelled or foreign field is reported rather than dropped on the next save.
- **Repairs are reported.** Normalization that fixes something (overlapping items, a shape missing its type) and items whose media has no asset record come back as warnings beside the document, never silently.

`SchemaError.code` is one of `SCHEMA_UNKNOWN_FORMAT`, `SCHEMA_TOO_NEW`, `SCHEMA_MIGRATION_FAILED` and `SCHEMA_INVALID`. These are stable: hosts and the render API switch on them.

## Changing a format

1. Change the type and the zod schema in the owning module.
2. Bump its version and add the migration from the previous one. A migration never needs anything but the document: no network, no stores, no clock.
3. Regenerate the JSON Schema (`npx vp test run src/schema -u` in `engine/`) and commit it with the change.
4. Add a test that reads a document of the previous version and checks what the migration did.
5. Say what changed and why in the commit message.

Breaking changes are allowed when they make the format better; pre-1.0 they land without compatibility shims beyond the migration itself. What's never allowed is a change a reader can't detect, or data a migration throws away without saying so.

### Upstream's project schema

FreeCut owns the project schema, so its migrations come in with upstream merges, and EmbeddableCut doesn't add its own project migrations. What EmbeddableCut needs to store goes in the document envelope or in asset records, which it owns. If the project itself must change, the change goes to FreeCut first.

## Extensions and other clients

- **A document names the custom effects, transitions and media providers it uses** in `requires`. A renderer or editor that hasn't registered one refuses the document instead of rendering it wrong; built-ins are never listed.
- **Credentials are never persisted.** An asset's `source` says where its bytes are; a URL that expires carries `expiresAt` and a stable `key` the host's resolver renews it from at open time.
- **Other clients read the JSON Schema** in `schemas/` and follow the same rules: migrate what's older, refuse what's newer, report what's repaired. A client that only displays a project may read a newer document read-only, but must never write it back.
