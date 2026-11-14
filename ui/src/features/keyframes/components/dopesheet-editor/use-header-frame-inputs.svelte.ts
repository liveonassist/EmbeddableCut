// SPDX-License-Identifier: MIT

/**
 * Header frame input hook.
 * Owns the local/global frame input state, the commit planners, and the
 * Enter/Escape key handler. Re-syncs input values when the selection or
 * frame offset changes; commits navigate the selected keyframes by a
 * delta computed from the input value.
 */

import type { BlockedFrameRange } from '@/features/keyframes/utils/transition-region'
import {
  getCommittedHeaderFrameValues,
  planGlobalHeaderFrameCommit,
  planLocalHeaderFrameCommit,
} from './header-frame-input-actions'
import { resolveSetState, type Ref, type SetState } from '../ref-state.svelte'

interface SelectedFrameSummary {
  hasSelection: boolean
  hasMixedFrames: boolean
  localFrame: number | null
  globalFrame: number | null
}

type MoveResult = { didMove: boolean; appliedDeltaFrames: number }

interface UseHeaderFrameInputsOptions {
  selectedFrameSummary: SelectedFrameSummary
  currentFrame: number
  globalFrame: number | null
  totalFrames: number
  transitionBlockedRanges: BlockedFrameRange[]
  onKeyframeMove?: unknown
  onNavigateToKeyframe?: (frame: number) => void
  moveSelectedKeyframesByDelta: (deltaFrames: number) => MoveResult
}

export interface UseHeaderFrameInputsReturn {
  readonly localFrameInputValue: string
  readonly globalFrameInputValue: string
  setLocalFrameInputValue: SetState<string>
  setGlobalFrameInputValue: SetState<string>
  skipNextHeaderFrameBlurRef: Ref<'local' | 'global' | null>
  resetHeaderFrameInputs: () => void
  commitLocalFrameInput: () => void
  commitGlobalFrameInput: () => void
  handleHeaderFrameInputKeyDown: (
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
    input: 'local' | 'global',
    commit: () => void,
  ) => void
}

export function useHeaderFrameInputs(
  options: () => UseHeaderFrameInputsOptions,
): UseHeaderFrameInputsReturn {
  let localFrameInputValue = $state('')
  let globalFrameInputValue = $state('')
  const skipNextHeaderFrameBlurRef: Ref<'local' | 'global' | null> = { current: null }

  const summaryLocalFrame = $derived(options().selectedFrameSummary.localFrame)
  const summaryGlobalFrame = $derived(options().selectedFrameSummary.globalFrame)

  const setLocalFrameInputValue: SetState<string> = (next) => {
    localFrameInputValue = resolveSetState(next, localFrameInputValue)
  }
  const setGlobalFrameInputValue: SetState<string> = (next) => {
    globalFrameInputValue = resolveSetState(next, globalFrameInputValue)
  }

  const resetHeaderFrameInputs = () => {
    localFrameInputValue = summaryLocalFrame === null ? '' : String(summaryLocalFrame)
    globalFrameInputValue = summaryGlobalFrame === null ? '' : String(summaryGlobalFrame)
  }

  // Keep inputs in sync with the current selection
  $effect.pre(() => {
    void summaryLocalFrame
    void summaryGlobalFrame
    resetHeaderFrameInputs()
  })

  const commitPlan = (
    plan: ReturnType<typeof planLocalHeaderFrameCommit>,
    opts: UseHeaderFrameInputsOptions,
  ) => {
    if (!plan) {
      resetHeaderFrameInputs()
      return
    }

    const moveResult = opts.moveSelectedKeyframesByDelta(
      plan.targetLocalFrame - plan.initialLocalFrame,
    )
    const committedValues = getCommittedHeaderFrameValues(plan, moveResult)

    localFrameInputValue = committedValues.localInputValue
    if (committedValues.globalInputValue !== null) {
      globalFrameInputValue = committedValues.globalInputValue
    }

    if (!moveResult.didMove) {
      return
    }

    opts.onNavigateToKeyframe?.(committedValues.finalLocalFrame)
  }

  const commitLocalFrameInput = () => {
    const opts = options()
    if (!opts.onKeyframeMove) {
      resetHeaderFrameInputs()
      return
    }

    commitPlan(
      planLocalHeaderFrameCommit({
        inputValue: localFrameInputValue,
        selectedFrameSummary: opts.selectedFrameSummary,
        totalFrames: opts.totalFrames,
        transitionBlockedRanges: opts.transitionBlockedRanges,
      }),
      opts,
    )
  }

  const commitGlobalFrameInput = () => {
    const opts = options()
    if (!opts.onKeyframeMove) {
      resetHeaderFrameInputs()
      return
    }

    commitPlan(
      planGlobalHeaderFrameCommit({
        inputValue: globalFrameInputValue,
        selectedFrameSummary: opts.selectedFrameSummary,
        currentFrame: opts.currentFrame,
        globalFrame: opts.globalFrame,
        totalFrames: opts.totalFrames,
        transitionBlockedRanges: opts.transitionBlockedRanges,
      }),
      opts,
    )
  }

  const handleHeaderFrameInputKeyDown = (
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
    input: 'local' | 'global',
    commit: () => void,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      skipNextHeaderFrameBlurRef.current = input
      event.currentTarget.blur()
      commit()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      resetHeaderFrameInputs()
      skipNextHeaderFrameBlurRef.current = input
      event.currentTarget.blur()
    }
  }

  return {
    get localFrameInputValue() {
      return localFrameInputValue
    },
    get globalFrameInputValue() {
      return globalFrameInputValue
    },
    setLocalFrameInputValue,
    setGlobalFrameInputValue,
    skipNextHeaderFrameBlurRef,
    resetHeaderFrameInputs,
    commitLocalFrameInput,
    commitGlobalFrameInput,
    handleHeaderFrameInputKeyDown,
  }
}
