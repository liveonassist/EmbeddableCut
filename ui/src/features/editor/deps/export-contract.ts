// SPDX-License-Identifier: MIT

/**
 * Adapter exports for export feature dependencies.
 * Editor modules should import export dialogs/helpers from here.
 */

export const importExportDialog = () => import('@/features/export/components/export-dialog.svelte')
export const importExportsDialog = () =>
  import('@/features/export/components/exports-dialog')

// The runner + persistence are light (the heavy render engine loads lazily
// inside the runner), so they're safe to import eagerly and mount at the
// editor root.
export { default as RenderQueueRunner } from '@/features/export/components/render-queue-runner.svelte'
export { default as RenderQueuePersistence } from '@/features/export/components/render-queue-persistence.svelte'
export { useRenderQueueStore } from '@/features/export/stores/render-queue-store'
