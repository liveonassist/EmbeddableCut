// SPDX-License-Identifier: MIT
// placeholder: ported elsewhere

/**
 * UI half of `keyframes-contract`: the components and hooks that stay with the app.
 */

export { DopesheetEditor } from '@/features/keyframes/components/dopesheet-editor'
export { default as PickWhipIcon } from '@/features/keyframes/components/dopesheet-editor/pick-whip-icon.svelte'
export { default as PropertyLinkPickWhipOverlay } from '@/features/keyframes/components/property-link-pick-whip-overlay.svelte'
export {
  GROUP_HEADER_HEIGHT,
  ROW_HEIGHT,
} from '@/features/keyframes/components/dopesheet-editor/dopesheet-constants'
export {
  getPropertyAccordionGroups,
  getPropertyDisplayGroups,
} from '@/features/keyframes/components/dopesheet-editor/property-groups'
export { default as CompactNavigator } from '@/features/keyframes/components/dopesheet-editor/compact-navigator.svelte'
export { getKeyframeNavigatorThumbMetrics } from '@/features/keyframes/components/dopesheet-editor/compact-navigator-utils'
export {
  KEYFRAME_DIAMOND_RENDERED_WIDTH_PX,
  KEYFRAME_EDGE_INSET,
} from '@/features/keyframes/components/dopesheet-editor/layout'
export { getNiceTickStep } from '@/features/keyframes/components/dopesheet-editor/dopesheet-helpers'
export { useRafCoalescedValue } from '@/features/keyframes/components/use-raf-coalesced-value.svelte'
