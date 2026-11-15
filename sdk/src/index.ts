// SPDX-License-Identifier: MIT

/**
 * EmbeddableCut's SDK. `createEditor` drives FreeCut's engine with or without
 * a UI; the project document, schemas and extension types are the contracts
 * shared with the editor, the render service and other clients.
 */

export {
  createEditor,
  Editor,
  type EditOperation,
  type EditResult,
  type EditorEvents,
  type EditorOptions,
  type ExportRequest,
  type ExportResult,
  type ExportSettings,
  type FrameRequest,
  type LoadResult,
  type NewProject,
  type ProjectInfo,
} from './editor'
export { EditorError, type EditorErrorCode } from './errors'
export {
  ExtensionHost,
  requirementsOf,
  type EffectDefinition,
  type Extension,
  type GpuTransitionDefinition,
  type OperationHandler,
  type TransitionDefinition,
  type TransitionExtension,
  type TransitionRenderer,
  type UiContributions,
} from './extensions'
export {
  MediaApi,
  clearUrlMediaCache,
  setUrlMediaCacheBudget,
  type MediaAcceptOptions,
  type MediaAcceptPolicy,
  type MediaCandidate,
  type MediaProvider,
  type MediaResolveReason,
  type MediaResolver,
  type MediaSourcePolicy,
  type ResolvedMediaSource,
  type UrlMedia,
} from './media'
export { SDK_VERSION } from './version'
export * from './bridge/index'
export {
  PROJECT_DOCUMENT_FORMAT,
  SCHEMA_VERSIONS,
  SchemaError,
  readProjectDocument,
  writeProjectDocument,
  type AssetRecord,
  type AssetSource,
  type DocumentWarning,
  type ExtensionRequirement,
  type ProjectDocument,
  type SchemaErrorCode,
  type SchemaIssue,
} from '@embeddablecut/engine/schema/index'
