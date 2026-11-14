// SPDX-License-Identifier: MIT

export interface JoinIndicatorsProps {
  hasJoinableLeft: boolean
  hasJoinableRight: boolean
  trackLocked: boolean
  dragAffectsJoin: { left: boolean; right: boolean }
  hoveredEdge: 'start' | 'end' | null
  isTrimming: boolean
  isStretching: boolean
  isBeingDragged: boolean
}
