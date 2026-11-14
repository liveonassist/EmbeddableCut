// SPDX-License-Identifier: MIT

import type { RouteOptions } from '$lib/router'
import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('NewProject')

export const Route: RouteOptions = {
  // The form UI lives in projects/new.lazy.svelte.
  beforeLoad: async () => {
    try {
      const { useProjectStore } = await import('@/features/projects/stores/project-store')
      const { loadProjects } = useProjectStore.getState()
      await loadProjects()
    } catch (err) {
      logger.warn('Failed to pre-load projects in beforeLoad:', err)
    }
  },
}
