// SPDX-License-Identifier: MIT

/** Counters the layout-section test stubs write to. */
export const layoutTestState = {
  sectionMountCount: 0,
  keyframeUpdateCounts: { x: 0, y: 0 } as Record<string, number>,
}
