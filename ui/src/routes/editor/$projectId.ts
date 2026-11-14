// SPDX-License-Identifier: MIT

import type { RouteContext, RouteOptions } from '$lib/router'
import { ProjectNotFoundError } from '@/app/route-error-cause'

/** Project metadata for the editor route (the timeline opens through the SDK editor). */
export interface EditorLoaderData {
  project: {
    id: string
    name: string
    width: number
    height: number
    fps: number
    backgroundColor?: string
  }
  migration: {
    storedSchemaVersion: number
    currentSchemaVersion: number
    requiresUpgrade: boolean
  }
}

export const Route: RouteOptions = {
  // The router runs loaders on every navigation, so migration state is fresh
  // on reopen (TanStack's `gcTime: 0` here).
  loader: async ({ params }: RouteContext): Promise<EditorLoaderData> => {
    const projectId = params.projectId!
    const [{ CURRENT_SCHEMA_VERSION }, { getProject }] = await Promise.all([
      import('@/shared/projects/migrations'),
      import('@/infrastructure/storage'),
    ])
    // Validate project exists - actual loading happens in the editor route through the SDK
    const project = await getProject(projectId)

    if (!project) {
      throw new ProjectNotFoundError(projectId)
    }

    const storedSchemaVersion = project.schemaVersion ?? 1

    // Only pass metadata needed for Editor initialization (not timeline data)
    return {
      project: {
        id: project.id,
        name: project.name,
        width: project.metadata.width,
        height: project.metadata.height,
        fps: project.metadata.fps,
        backgroundColor: project.metadata.backgroundColor,
      },
      migration: {
        storedSchemaVersion,
        currentSchemaVersion: CURRENT_SCHEMA_VERSION,
        requiresUpgrade: storedSchemaVersion < CURRENT_SCHEMA_VERSION,
      },
    }
  },
}
