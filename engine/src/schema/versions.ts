// SPDX-License-Identifier: MIT

/**
 * Every persisted or exchanged format, its owner, and its current version.
 *
 * A format's version changes only in the module that owns it, and only with a
 * migration from the version before (see docs/SCHEMAS.md). These are versions
 * of data, independent of the SDK's package version and of the render API's
 * `apiVersion`: a new SDK release that writes the same data keeps them.
 */

import { CURRENT_SCHEMA_VERSION } from '@/shared/projects/migrations/types'
import { WORKSPACE_SCHEMA_VERSION } from '@/infrastructure/storage/workspace-fs/paths'
import { BUNDLE_VERSION } from '@/features/project-bundle/types/bundle'
import { SNAPSHOT_VERSION } from '@/features/project-bundle/types/snapshot'

/** The portable project document's envelope: project, assets, required extensions. */
export const PROJECT_DOCUMENT_SCHEMA_VERSION = 1

/** The portable media asset record inside a project document. */
export const ASSET_SCHEMA_VERSION = 1

export const SCHEMA_VERSIONS = {
  /** `Project`, owned by FreeCut: `shared/projects/migrations/`. */
  project: CURRENT_SCHEMA_VERSION,
  /** `ProjectDocument`, owned by EmbeddableCut: `schema/project-document.ts`. */
  projectDocument: PROJECT_DOCUMENT_SCHEMA_VERSION,
  /** `AssetRecord`, owned by EmbeddableCut: `schema/asset.ts`. */
  asset: ASSET_SCHEMA_VERSION,
  /** The workspace folder layout, owned by FreeCut: `infrastructure/storage/workspace-fs/`. */
  workspace: WORKSPACE_SCHEMA_VERSION,
  /** The `.freecut.zip` bundle manifest, owned by FreeCut: `features/project-bundle/`. */
  bundle: BUNDLE_VERSION,
  /** FreeCut's JSON snapshot export, owned by FreeCut: `features/project-bundle/`. */
  snapshot: SNAPSHOT_VERSION,
} as const
