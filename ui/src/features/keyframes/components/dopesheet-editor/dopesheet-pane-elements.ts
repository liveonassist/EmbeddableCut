// SPDX-License-Identifier: MIT

/**
 * Dopesheet pane elements: the state they read and the plain helpers around
 * them. `dopesheet-pane-elements.svelte` exports the panes themselves as
 * snippets taking this state, so the exclusive (`dopesheet`/`graph`) modes and
 * the `split` view compose the same panes.
 */

import type { Snippet } from 'svelte'
import type { TFunction } from 'i18next'
import type { AnimatableProperty } from '@/types/keyframe'
import type { Ref } from '../ref-state.svelte'
import type { DopesheetHeaderFrameInputsProps } from './dopesheet-presentation'
import type { DopesheetEditorProps } from './dopesheet-editor-props'
import type { DopesheetPropertyRow, Viewport } from './dopesheet-types'
import type { UseDopesheetSelectionMetaReturn } from './use-dopesheet-selection-meta.svelte'
import type { UseHeaderFrameInputsReturn } from './use-header-frame-inputs.svelte'

type RulerPointerEvent = PointerEvent & { currentTarget: HTMLDivElement }

/**
 * Everything the pane elements read: the editor's resolved props and derived
 * state. The editor passes an object of getters, so a pane re-reads only the
 * values it uses.
 */
export interface DopesheetPaneElementsState {
  // Empty-state copy
  readonly t: TFunction
  readonly hasPropertyFilters: boolean
  readonly hasProceduralMotion: boolean
  // Ruler header
  readonly propertyGridStyle: string
  readonly timelineRef: Ref<HTMLDivElement | null>
  readonly handleRulerPointerDown: (event: RulerPointerEvent) => void
  readonly handleRulerPointerMove: (event: RulerPointerEvent) => void
  readonly handleRulerPointerUp: (event: RulerPointerEvent) => void
  readonly handleRulerPointerLeave: (event: RulerPointerEvent) => void
  readonly ticks: number[]
  readonly frameToX: (frame: number) => number
  readonly graphRulerUnit: 'frames' | 'seconds'
  readonly reservedScrollbarGutterWidth: number
  readonly filterKeyframedOnly: boolean
  readonly setShowKeyframedOnly: (keyframedOnly: boolean) => void
  readonly presentation: NonNullable<DopesheetEditorProps['presentation']>
  readonly propertyFilter: DopesheetEditorProps['propertyFilter']
  readonly hasLinkedTimelineAxis: boolean
  /** The linked timeline's scroll surface, or undefined when the editor has none. */
  readonly timelineScrollContainerRef: Ref<HTMLElement | null> | undefined
  readonly getTimelineLivePixelsPerSecond: DopesheetEditorProps['getTimelineLivePixelsPerSecond']
  readonly timelinePixelsPerSecond: number
  readonly itemFrom: number
  // Playhead overlays
  readonly columnWidth: number
  readonly showPlayhead: boolean
  readonly onSkim: DopesheetEditorProps['onSkim']
  readonly playheadFrame: DopesheetEditorProps['playheadFrame']
  readonly currentFrame: number
  readonly totalFrames: number
  readonly playheadClampToItemBounds: boolean
  readonly globalFrameToPixels: DopesheetEditorProps['globalFrameToPixels']
  readonly rulerScrubActiveRef: Ref<boolean>
  readonly rulerScrubHandoffFrameRef: Ref<number | null>
  readonly effectiveTimelineWidth: number
  readonly fps: number
  readonly isRulerScrubbing: boolean
  // Sheet body
  readonly scrollAreaRef: Ref<HTMLDivElement | null>
  readonly sheetRows: DopesheetPropertyRow[]
  readonly textMotionBands: NonNullable<DopesheetEditorProps['textMotionBands']>
  readonly rowElements: Snippet
  readonly marqueeOverlayRef: Ref<HTMLDivElement | null>
  readonly handleTimelineBackgroundPointerDown: (
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) => void
  // Graph pane
  readonly propertyColumnElements: Snippet
  readonly graphPaneRef: Ref<HTMLDivElement | null>
  readonly disabled: boolean
  readonly graphDisplayPropertyLocked: boolean
  readonly focusGraphPane: () => void
  readonly handleGraphPaneKeyDown: (event: KeyboardEvent) => void
  readonly graphPaneSize: { width: number; height: number }
  readonly visibleGraphProperties: AnimatableProperty[]
  readonly viewport: Viewport
  readonly updateViewport: (next: Viewport) => void
  readonly itemId: DopesheetEditorProps['itemId']
  readonly keyframesByProperty: DopesheetEditorProps['keyframesByProperty']
  readonly graphDisplayProperty: AnimatableProperty | null
  readonly singleCurveMode: boolean
  readonly compoundSecondaryProperties: NonNullable<
    DopesheetEditorProps['compoundSecondaryProperties']
  >
  readonly selectedKeyframeIds: Set<string>
  readonly onKeyframeMove: DopesheetEditorProps['onKeyframeMove']
  readonly timingStripPreviewFrames: Record<string, number> | null
  readonly constrainGraphFrameDelta: (deltaFrames: number, draggedKeyframeIds: string[]) => number
  readonly onBezierHandleMove: DopesheetEditorProps['onBezierHandleMove']
  readonly onSelectionChange: DopesheetEditorProps['onSelectionChange']
  readonly onPropertyChange: DopesheetEditorProps['onPropertyChange']
  readonly onScrub: DopesheetEditorProps['onScrub']
  readonly onScrubStart: DopesheetEditorProps['onScrubStart']
  readonly onScrubEnd: DopesheetEditorProps['onScrubEnd']
  readonly onDragStart: DopesheetEditorProps['onDragStart']
  readonly onDragEnd: DopesheetEditorProps['onDragEnd']
  readonly onAddKeyframe: DopesheetEditorProps['onAddKeyframe']
  readonly onRemoveKeyframes: DopesheetEditorProps['onRemoveKeyframes']
  readonly onNavigateToKeyframe: DopesheetEditorProps['onNavigateToKeyframe']
  readonly transitionBlockedRanges: DopesheetEditorProps['transitionBlockedRanges']
  readonly proceduralPreview: DopesheetEditorProps['proceduralPreview']
  readonly snapEnabled: boolean
  readonly showAllGraphHandles: boolean
  readonly autoZoomGraphHeight: boolean
  readonly graphVerticalZoomValue: number
  readonly isSplitView: boolean
  readonly graphMode: NonNullable<DopesheetEditorProps['graphMode']>
  readonly speedGraphContent: DopesheetEditorProps['speedGraphContent']
  // Affected frame range overlay
  readonly affectedFrameRange: DopesheetEditorProps['affectedFrameRange']
  readonly affectedFrameRangeGeometry: { left: number; width: number } | null
  // Header frame inputs
  readonly selectedFrameSummary: UseDopesheetSelectionMetaReturn['selectedFrameSummary']
  readonly globalFrame: number | null
  readonly localFrameInputValue: UseHeaderFrameInputsReturn['localFrameInputValue']
  readonly globalFrameInputValue: UseHeaderFrameInputsReturn['globalFrameInputValue']
  readonly setLocalFrameInputValue: UseHeaderFrameInputsReturn['setLocalFrameInputValue']
  readonly setGlobalFrameInputValue: UseHeaderFrameInputsReturn['setGlobalFrameInputValue']
  readonly skipNextHeaderFrameBlurRef: UseHeaderFrameInputsReturn['skipNextHeaderFrameBlurRef']
  readonly commitLocalFrameInput: UseHeaderFrameInputsReturn['commitLocalFrameInput']
  readonly commitGlobalFrameInput: UseHeaderFrameInputsReturn['commitGlobalFrameInput']
  readonly handleHeaderFrameInputKeyDown: UseHeaderFrameInputsReturn['handleHeaderFrameInputKeyDown']
}

/** Copy for the sheet and graph empty states. */
export function resolveDopesheetEmptyState(state: DopesheetPaneElementsState) {
  const { t, hasPropertyFilters, hasProceduralMotion } = state

  const emptyStateMessage = hasPropertyFilters
    ? t('timeline.keyframeEditor.noParametersMatch')
    : t('timeline.keyframeEditor.noKeyframesToDisplay')
  const showEmptyGuidance = !hasPropertyFilters
  // A clip can be animated by procedural modulators / audio pulse yet have no
  // keyframes — the sheet would otherwise look empty and "unanimated".
  const proceduralHint =
    showEmptyGuidance && hasProceduralMotion
      ? t('timeline.keyframeEditor.proceduralMotionHint')
      : undefined

  return { emptyStateMessage, showEmptyGuidance, proceduralHint }
}

/**
 * Properties shown in the graph pane: in single-curve mode only the selected
 * property (plus its compound secondary), otherwise all visible properties.
 */
export function resolveGraphVisiblePropertyList(
  singleCurveMode: boolean | undefined,
  graphDisplayProperty: AnimatableProperty | null,
  compoundSecondaryProperties: Partial<Record<AnimatableProperty, AnimatableProperty>>,
  visibleGraphProperties: AnimatableProperty[],
): AnimatableProperty[] {
  return singleCurveMode && graphDisplayProperty
    ? [
        graphDisplayProperty,
        ...(compoundSecondaryProperties[graphDisplayProperty]
          ? [compoundSecondaryProperties[graphDisplayProperty]!]
          : []),
      ]
    : visibleGraphProperties
}

/** Whether the classic shell has an affected-frame-range band to place (React's element being non-null). */
export function hasDopesheetAffectedFrameRangeOverlay(state: DopesheetPaneElementsState): boolean {
  return Boolean(state.affectedFrameRange && state.affectedFrameRangeGeometry)
}

/**
 * Header frame inputs the workspace toolbar and the classic shell share, so
 * both build them from one source. The result reads through to `state`.
 */
export function buildDopesheetHeaderFrameInputs(
  state: DopesheetPaneElementsState,
): DopesheetHeaderFrameInputsProps {
  return {
    get disabled() {
      return state.disabled
    },
    get inputsEnabled() {
      return (
        Boolean(state.onKeyframeMove) &&
        state.selectedFrameSummary.hasSelection &&
        !state.selectedFrameSummary.hasMixedFrames
      )
    },
    get totalFrames() {
      return state.totalFrames
    },
    get globalFrame() {
      return state.globalFrame
    },
    get localFrameInputValue() {
      return state.localFrameInputValue
    },
    get globalFrameInputValue() {
      return state.globalFrameInputValue
    },
    get setLocalFrameInputValue() {
      return state.setLocalFrameInputValue
    },
    get setGlobalFrameInputValue() {
      return state.setGlobalFrameInputValue
    },
    get skipNextHeaderFrameBlurRef() {
      return state.skipNextHeaderFrameBlurRef
    },
    get commitLocalFrameInput() {
      return state.commitLocalFrameInput
    },
    get commitGlobalFrameInput() {
      return state.commitGlobalFrameInput
    },
    get handleHeaderFrameInputKeyDown() {
      return state.handleHeaderFrameInputKeyDown
    },
  }
}
