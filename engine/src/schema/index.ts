// SPDX-License-Identifier: MIT

/**
 * The engine's persisted and exchanged formats: their versions and owners,
 * the portable project document and asset record, and their JSON Schema.
 * docs/SCHEMAS.md is the policy these follow.
 */

export { SCHEMA_VERSIONS, ASSET_SCHEMA_VERSION, PROJECT_DOCUMENT_SCHEMA_VERSION } from './versions'
export { SchemaError, type SchemaErrorCode, type SchemaIssue } from './errors'
export {
  assetRecordFromMedia,
  assetRecordSchema,
  assetSourceSchema,
  type AssetRecord,
  type AssetSource,
} from './asset'
export {
  PROJECT_DOCUMENT_FORMAT,
  extensionRequirementSchema,
  projectDocumentSchema,
  readProjectDocument,
  writeProjectDocument,
  type DocumentWarning,
  type ExtensionRequirement,
  type ProjectDocument,
  type ReadProjectDocumentResult,
  type WriteProjectDocumentOptions,
} from './project-document'
export { publishedJsonSchemas } from './json-schema'
