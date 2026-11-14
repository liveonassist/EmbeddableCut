// SPDX-License-Identifier: MIT

import { loadProjectThumbnail } from '@/infrastructure/storage'
import type { Project } from '@/types/project'
import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('ProjectThumbnail')

/**
 * Hook to load a project thumbnail from workspace-backed blob storage.
 * Falls back to the deprecated base64 thumbnail for backward compatibility.
 *
 * @param project - Getter for the project to get thumbnail for
 * @returns Object URL for the thumbnail, or undefined if not available
 */
export function useProjectThumbnail(project: () => Project): {
  readonly current: string | undefined
} {
  let thumbnailUrl = $state<string | undefined>(undefined)

  $effect(() => {
    const { id, thumbnailId, thumbnail } = project()
    void project().updatedAt
    let objectUrl: string | undefined
    let cancelled = false

    async function loadThumbnail() {
      // Try to load the workspace-backed project thumbnail blob.
      if (thumbnailId) {
        try {
          const blob = await loadProjectThumbnail(id)
          if (blob && !cancelled) {
            objectUrl = URL.createObjectURL(blob)
            thumbnailUrl = objectUrl
            return
          }
        } catch (error) {
          logger.warn('Failed to load thumbnail from workspace storage:', error)
        }
      }

      // Fall back to deprecated base64 thumbnail
      if (thumbnail && !cancelled) {
        thumbnailUrl = thumbnail
      }
    }

    void loadThumbnail()

    // Cleanup object URL on unmount or when project changes
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  })

  return {
    get current() {
      return thumbnailUrl
    },
  }
}
