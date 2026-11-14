// SPDX-License-Identifier: MIT

/** Why a document was refused. Stable: hosts and the render API switch on these. */
export type SchemaErrorCode =
  /** Not this kind of document at all (missing or wrong `format`). */
  | 'SCHEMA_UNKNOWN_FORMAT'
  /** Written by a newer EmbeddableCut or FreeCut than this one reads. */
  | 'SCHEMA_TOO_NEW'
  /** Older than any migration reaches, or a migration threw. */
  | 'SCHEMA_MIGRATION_FAILED'
  /** The right kind and version, but the content doesn't match the schema. */
  | 'SCHEMA_INVALID'

export interface SchemaIssue {
  /** JSON pointer-style path into the document, e.g. `project.timeline.items.3.from`. */
  path: string
  message: string
}

/** A persisted document this engine won't read as-is. Nothing is ever dropped silently. */
export class SchemaError extends Error {
  readonly code: SchemaErrorCode
  readonly issues: readonly SchemaIssue[]

  constructor(code: SchemaErrorCode, message: string, issues: readonly SchemaIssue[] = []) {
    super(message)
    this.name = 'SchemaError'
    this.code = code
    this.issues = issues
  }
}
