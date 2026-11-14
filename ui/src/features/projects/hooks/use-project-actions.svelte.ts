// SPDX-License-Identifier: MIT

import { useProjectStore } from '@/features/projects/stores/project-store'
import type { ProjectFormData } from '@/features/projects/utils/validation'

// The store's actions never change, so each is read when called.
const actions = () => useProjectStore.getState()

/**
 * Hook for project CRUD actions
 */
export const useProjectActions = () => ({
  loadProjects: () => actions().loadProjects(),
  loadProject: (...args: Parameters<ReturnType<typeof actions>['loadProject']>) =>
    actions().loadProject(...args),
  createProject: (...args: Parameters<ReturnType<typeof actions>['createProject']>) =>
    actions().createProject(...args),
  updateProject: (...args: Parameters<ReturnType<typeof actions>['updateProject']>) =>
    actions().updateProject(...args),
  deleteProject: (...args: Parameters<ReturnType<typeof actions>['deleteProject']>) =>
    actions().deleteProject(...args),
  duplicateProject: (...args: Parameters<ReturnType<typeof actions>['duplicateProject']>) =>
    actions().duplicateProject(...args),
  setCurrentProject: (...args: Parameters<ReturnType<typeof actions>['setCurrentProject']>) =>
    actions().setCurrentProject(...args),
  clearError: () => actions().clearError(),
})

/**
 * Hook for search and filter actions
 */
export const useProjectFilters = () => ({
  setSearchQuery: (...args: Parameters<ReturnType<typeof actions>['setSearchQuery']>) =>
    actions().setSearchQuery(...args),
  setSortField: (...args: Parameters<ReturnType<typeof actions>['setSortField']>) =>
    actions().setSortField(...args),
  setSortDirection: (...args: Parameters<ReturnType<typeof actions>['setSortDirection']>) =>
    actions().setSortDirection(...args),
  setFilterResolution: (...args: Parameters<ReturnType<typeof actions>['setFilterResolution']>) =>
    actions().setFilterResolution(...args),
  setFilterFps: (...args: Parameters<ReturnType<typeof actions>['setFilterFps']>) =>
    actions().setFilterFps(...args),
  clearFilters: () => actions().clearFilters(),
})

/**
 * Hook for creating a project with error handling
 */
export const useCreateProject = () => async (data: ProjectFormData) => {
  try {
    const project = await actions().createProject(data)
    return { success: true, project, error: null }
  } catch (error) {
    return {
      success: false,
      project: null,
      error: error instanceof Error ? error.message : 'Failed to create project',
    }
  }
}

/**
 * Hook for deleting a project
 */
export const useDeleteProject = () => async (id: string, clearLocalFiles?: boolean) => {
  try {
    const result = await actions().deleteProject(id, clearLocalFiles)
    return {
      success: true,
      error: null,
      localFilesDeleted: result.localFilesDeleted,
      trashed: result.trashed,
      deletedAt: result.deletedAt,
      originalName: result.originalName,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete project',
      localFilesDeleted: false,
      trashed: false as const,
      deletedAt: 0,
      originalName: '',
    }
  }
}

/**
 * Hook for restoring a soft-deleted project. Pair with `useDeleteProject`
 * to expose an Undo affordance (e.g. via a sonner toast action button).
 */
export const useRestoreProject = () => async (id: string) => {
  try {
    await actions().restoreProject(id)
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore project',
    }
  }
}

/**
 * Hook for permanently deleting a trashed project. Cleans up media
 * references and wipes the project directory from disk. Cannot be
 * undone — callers should confirm with the user first.
 */
export const usePermanentlyDeleteProject = () => async (id: string) => {
  try {
    await actions().permanentlyDeleteProject(id)
    return { success: true, error: null }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete project',
    }
  }
}

/**
 * Hook for duplicating a project
 */
export const useDuplicateProject = () => async (id: string) => {
  try {
    const project = await actions().duplicateProject(id)
    return { success: true, project, error: null }
  } catch (error) {
    return {
      success: false,
      project: null,
      error: error instanceof Error ? error.message : 'Failed to duplicate project',
    }
  }
}
