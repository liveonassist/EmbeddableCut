// SPDX-License-Identifier: MIT

/**
 * Dopesheet row renderers.
 * Presentation-only components for the property column: one property group
 * header, and one property row's controls. Both receive the state the
 * orchestrator already derives.
 */

export { default as DopesheetGroupHeader } from './dopesheet-group-header.svelte'
export { default as DopesheetPropertyRowContent } from './dopesheet-property-row-content.svelte'
export type { DopesheetGroupHeaderProps, DopesheetPropertyRowContentProps } from './types'
