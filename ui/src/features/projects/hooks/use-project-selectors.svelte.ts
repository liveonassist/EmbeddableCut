// SPDX-License-Identifier: MIT

import { useProjectStore } from '@/features/projects/stores/project-store'
import { select, shallow } from '$lib/store.svelte'
import {
  filterProjects,
  sortProjects,
  filterByResolution,
  filterByFps,
} from '@/features/projects/utils/project-helpers'
import type { Project } from '@/types/project'

/**
 * Get all projects (raw, unfiltered)
 */
export const useProjects = () => select(useProjectStore, (s) => s.projects)

/**
 * Get filtered and sorted projects based on current filter state
 */
export const useFilteredProjects = (): { readonly current: Project[] } => {
  const state = select(
    useProjectStore,
    (s) => ({
      projects: s.projects,
      searchQuery: s.searchQuery,
      sortField: s.sortField,
      sortDirection: s.sortDirection,
      filterResolution: s.filterResolution,
      filterFps: s.filterFps,
    }),
    shallow,
  )

  const filtered = $derived.by(() => {
    const { projects, searchQuery, sortField, sortDirection, filterResolution, filterFps } =
      state.current
    let filtered = projects

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filterProjects(filtered, searchQuery)
    }

    // Apply resolution filter
    if (filterResolution) {
      filtered = filterByResolution(filtered, filterResolution)
    }

    // Apply FPS filter
    if (filterFps) {
      filtered = filterByFps(filtered, filterFps)
    }

    // Apply sorting
    filtered = sortProjects(filtered, sortField, sortDirection)

    return filtered
  })

  return {
    get current() {
      return filtered
    },
  }
}

/**
 * Get loading state
 */
export const useProjectsLoading = () => select(useProjectStore, (s) => s.isLoading)

/**
 * Get error state
 */
export const useProjectsError = () => select(useProjectStore, (s) => s.error)

/**
 * Get sort field
 */
export const useSortField = () => select(useProjectStore, (s) => s.sortField)

/**
 * Get sort direction
 */
export const useSortDirection = () => select(useProjectStore, (s) => s.sortDirection)

/**
 * Get resolution filter
 */
export const useFilterResolution = () => select(useProjectStore, (s) => s.filterResolution)

/**
 * Get FPS filter
 */
export const useFilterFps = () => select(useProjectStore, (s) => s.filterFps)

/**
 * Check if any filters are active
 */
export const useHasActiveFilters = (): { readonly current: boolean } => {
  const active = select(useProjectStore, (s) =>
    Boolean(s.searchQuery.trim() || s.filterResolution || s.filterFps),
  )
  return active
}
