// SPDX-License-Identifier: MIT

import {
  getActiveTabId,
  useCompositionNavigationStore,
  useCompositionsStore,
} from '@/features/editor/deps/timeline-store'
import { useComposeUiStore } from '../compose-ui-store'

export interface MotionWorkspaceProject {
  width: number
  height: number
  fps: number
  backgroundColor?: string
}

export function restoreMotionReturnTimeline(): void {
  const composeUi = useComposeUiStore.getState()
  if (!composeUi.motionReturnTabCaptured) return
  const returnTabId = composeUi.motionReturnTabId
  // Clear first so navigation-triggered store updates cannot re-enter this path.
  composeUi.clearMotionReturnTab()
  useCompositionNavigationStore.getState().switchToSequence(returnTabId)
}

export function getMotionReturnTabAtMount(): string | null {
  const navigation = useCompositionNavigationStore.getState()
  const activeComposition = navigation.activeCompositionId
    ? useCompositionsStore.getState().compositionById[navigation.activeCompositionId]
    : undefined
  // On refresh/HMR the ephemeral Motion session state may be gone while the
  // persisted navigation is still inside Motion. Never capture that Motion id
  // as an Edit return target; Main is the safe editorial fallback.
  if (activeComposition?.editorKind === 'composite-2d') return null
  return getActiveTabId(navigation.breadcrumbs)
}
