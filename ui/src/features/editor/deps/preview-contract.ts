// SPDX-License-Identifier: MIT

/**
 * Adapter exports for preview dependencies.
 * Editor modules should import preview components/hooks/stores from here.
 */

export { useGizmoStore } from '@/features/preview/stores/gizmo-store'
export type { ItemPreview, ItemPropertiesPreview } from '@/features/preview/stores/gizmo-store'
export { useMaskEditorStore } from '@/features/preview/stores/mask-editor-store'
export { useCornerPinStore } from '@/features/preview/stores/corner-pin-store'
export { usePowerWindowEditorStore } from '@/features/preview/stores/power-window-editor-store'
export { useSpatialEffectEditorStore } from '@/features/preview/stores/spatial-effect-editor-store'
export { useThrottledFrame } from '@/features/preview/hooks/use-throttled-frame.svelte'
export { useItemsStore } from '@/features/preview/deps/timeline-store'
