// SPDX-License-Identifier: MIT

/**
 * Adapter exports for preview dependencies.
 * Editor modules should import preview components/hooks/stores from here.
 */

export { ColorVideoPreview, VideoPreview } from '@/features/preview/components/video-preview'
export { default as PlaybackControls } from '@/features/preview/components/playback-controls.svelte'
export { default as AlignmentToolbar } from '@/features/preview/components/alignment-hud.svelte'
export { default as TimecodeDisplay } from '@/features/preview/components/timecode-display.svelte'
export { default as PreviewZoomControls } from '@/features/preview/components/preview-zoom-controls.svelte'

export const importSourceMonitor = () =>
  import('@/features/preview/components/source-monitor.svelte')
export const importInlineSourcePreview = () =>
  import('@/features/preview/components/inline-source-preview.svelte')
export const importInlineCompositionPreview = () =>
  import('@/features/preview/components/inline-composition-preview.svelte')
export const importColorScopesMonitor = () =>
  import('@/features/preview/components/color-scopes-monitor.svelte')

export { useGizmoStore } from '@/features/preview/stores/gizmo-store'
export type { ItemPreview, ItemPropertiesPreview } from '@/features/preview/stores/gizmo-store'
export { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
export { useCornerPinStore } from '@/features/preview/stores/corner-pin-store'
export { usePowerWindowEditorStore } from '@/features/preview/stores/power-window-editor-store'
export { useSpatialEffectEditorStore } from '@/features/preview/stores/spatial-effect-editor-store'
export { useThrottledFrame } from '@/features/preview/hooks/use-throttled-frame.svelte'
export { useItemsStore } from '@/features/preview/deps/timeline-store'
