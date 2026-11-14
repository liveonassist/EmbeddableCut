// SPDX-License-Identifier: MIT

/**
 * The portable project document: a FreeCut project with the asset records its
 * items reference and the extensions it needs. It's what the SDK loads and
 * saves, what the render service accepts inline, and what other clients
 * (Flutter) exchange. The editor's workspace keeps storing `project.json` and
 * per-media `metadata.json` as FreeCut does; a document is assembled from them.
 *
 * Two versions travel in it, owned separately: `schemaVersion` is this
 * envelope's, and `project.schemaVersion` is FreeCut's project schema, so an
 * upstream migration never renumbers the envelope or the other way round.
 */

import { z } from "zod";
import type { Project } from "@/types/project";
import { projectSchema } from "@/features/project-bundle/schemas/project-schema";
import {
  CURRENT_SCHEMA_VERSION,
  ProjectSchemaTooNewError,
  migrateProject,
  type ProjectWarning,
} from "@/shared/projects/migrations";
import { assetRecordSchema, type AssetRecord } from "./asset";
import { SchemaError, type SchemaIssue } from "./errors";
import { PROJECT_DOCUMENT_SCHEMA_VERSION } from "./versions";

export const PROJECT_DOCUMENT_FORMAT = "embeddablecut.project";

/**
 * Something a document can't be rendered faithfully without. Built-in
 * effects and transitions are never listed; custom ones always are, so a
 * renderer refuses a document it would otherwise render wrong.
 */
export const extensionRequirementSchema = z
  .object({
    kind: z.enum(["effect", "transition", "media-provider"]),
    id: z.string().min(1),
  })
  .strict();

export const projectDocumentSchema = z
  .object({
    format: z.literal(PROJECT_DOCUMENT_FORMAT),
    schemaVersion: z.literal(PROJECT_DOCUMENT_SCHEMA_VERSION),
    project: projectSchema.extend({ schemaVersion: z.literal(CURRENT_SCHEMA_VERSION) }),
    assets: z.array(assetRecordSchema),
    requires: z.array(extensionRequirementSchema).default([]),
    /** What wrote the document, for diagnostics only; readers never branch on it. */
    generator: z.object({ name: z.string(), version: z.string() }).strict().optional(),
  })
  .strict();

export type ExtensionRequirement = z.infer<typeof extensionRequirementSchema>;
export type ProjectDocument = z.infer<typeof projectDocumentSchema>;

/** A finding the reader repaired or that a consumer should know about; never fatal. */
export type DocumentWarning =
  | ProjectWarning
  | { code: "ASSET_MISSING"; message: string; itemIds: string[]; mediaId: string };

export interface ReadProjectDocumentResult {
  document: ProjectDocument;
  /** True when the project inside was migrated or normalized on the way in. */
  migrated: boolean;
  warnings: DocumentWarning[];
}

function issuesOf(error: z.ZodError, prefix = ""): SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `mediaId` an item uses, root timeline and compositions alike. */
function referencedMedia(project: Project): Map<string, string[]> {
  const byMedia = new Map<string, string[]>();
  const visit = (items: ReadonlyArray<{ id: string; mediaId?: string }> | undefined) => {
    for (const item of items ?? []) {
      if (!item.mediaId) continue;
      const ids = byMedia.get(item.mediaId) ?? [];
      ids.push(item.id);
      byMedia.set(item.mediaId, ids);
    }
  };
  visit(project.timeline?.items);
  for (const composition of project.timeline?.compositions ?? []) visit(composition.items);
  return byMedia;
}

/**
 * Reads a project document from untrusted JSON: refuses other formats and
 * newer versions, migrates an older project, then validates the whole.
 *
 * @throws {SchemaError} `SCHEMA_UNKNOWN_FORMAT`, `SCHEMA_TOO_NEW`,
 *   `SCHEMA_MIGRATION_FAILED` or `SCHEMA_INVALID`; the document is never
 *   partially read.
 */
export function readProjectDocument(data: unknown): ReadProjectDocumentResult {
  if (!isRecord(data) || data.format !== PROJECT_DOCUMENT_FORMAT) {
    throw new SchemaError(
      "SCHEMA_UNKNOWN_FORMAT",
      `Not an EmbeddableCut project document (expected format "${PROJECT_DOCUMENT_FORMAT}").`,
    );
  }
  const version = data.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new SchemaError("SCHEMA_INVALID", "The document has no valid schemaVersion.", [
      { path: "schemaVersion", message: "Expected a positive integer" },
    ]);
  }
  if (version > PROJECT_DOCUMENT_SCHEMA_VERSION) {
    throw new SchemaError(
      "SCHEMA_TOO_NEW",
      `The document is schema v${version}; this engine reads up to v${PROJECT_DOCUMENT_SCHEMA_VERSION}.`,
    );
  }
  if (!isRecord(data.project)) {
    throw new SchemaError("SCHEMA_INVALID", "The document has no project.", [
      { path: "project", message: "Expected an object" },
    ]);
  }

  let migration: ReturnType<typeof migrateProject>;
  try {
    migration = migrateProject(data.project as unknown as Project);
  } catch (error) {
    if (error instanceof ProjectSchemaTooNewError) {
      throw new SchemaError("SCHEMA_TOO_NEW", error.message);
    }
    throw new SchemaError(
      "SCHEMA_MIGRATION_FAILED",
      error instanceof Error ? error.message : String(error),
    );
  }

  const parsed = projectDocumentSchema.safeParse({ ...data, project: migration.project });
  if (!parsed.success) {
    throw new SchemaError(
      "SCHEMA_INVALID",
      "The project document does not match its schema.",
      issuesOf(parsed.error),
    );
  }

  const warnings: DocumentWarning[] = [...migration.warnings];
  const assetIds = new Set(parsed.data.assets.map((asset) => asset.id));
  for (const [mediaId, itemIds] of referencedMedia(parsed.data.project as Project)) {
    if (assetIds.has(mediaId)) continue;
    warnings.push({
      code: "ASSET_MISSING",
      message: `Items reference media ${mediaId}, which the document has no asset record for.`,
      itemIds,
      mediaId,
    });
  }

  return { document: parsed.data, migrated: migration.migrated, warnings };
}

export interface WriteProjectDocumentOptions {
  requires?: ExtensionRequirement[];
  generator?: { name: string; version: string };
}

/**
 * Builds a document from a project and the asset records it references,
 * stamping both versions. The project must be at the current schema, as a
 * loaded project and the stores' are. Runtime-only fields
 * (`rootFolderHandle`) are dropped; anything else the schema doesn't know is
 * an error, not a loss.
 *
 * @throws {SchemaError} `SCHEMA_INVALID` when the project is at another
 *   schema version, or it or an asset doesn't match its schema.
 */
export function writeProjectDocument(
  project: Project,
  assets: readonly AssetRecord[],
  options: WriteProjectDocumentOptions = {},
): ProjectDocument {
  if (project.schemaVersion !== undefined && project.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new SchemaError(
      "SCHEMA_INVALID",
      `The project is schema v${project.schemaVersion}; migrate it to v${CURRENT_SCHEMA_VERSION} before writing a document.`,
      [{ path: "project.schemaVersion", message: `Expected ${CURRENT_SCHEMA_VERSION}` }],
    );
  }
  const { rootFolderHandle: _handle, ...persisted } = project;
  const document = {
    format: PROJECT_DOCUMENT_FORMAT,
    schemaVersion: PROJECT_DOCUMENT_SCHEMA_VERSION,
    project: { ...persisted, schemaVersion: CURRENT_SCHEMA_VERSION },
    assets: [...assets],
    requires: options.requires ?? [],
    ...(options.generator ? { generator: options.generator } : {}),
  };
  const parsed = projectDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new SchemaError(
      "SCHEMA_INVALID",
      "The project does not match the document schema.",
      issuesOf(parsed.error),
    );
  }
  return parsed.data;
}
