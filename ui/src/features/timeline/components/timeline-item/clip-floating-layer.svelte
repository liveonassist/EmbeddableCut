<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import TrimInfoOverlay from './trim-info-overlay.svelte'
  import FloatingReadout from './floating-readout.svelte'
  import TrackPushHandle from './track-push-handle.svelte'
  import ToolOperationOverlay from './tool-operation-overlay.svelte'
  import EdgeHalos from './edge-halos.svelte'
  import TransitionDropGhost from './transition-drop-ghost.svelte'
  import FollowerDragGhost from './drag-ghosts.svelte'
  import DragBlockedTooltip from './drag-blocked-tooltip.svelte'
  import TranscribeDialogController from './transcribe-dialog-controller.svelte'
  import type { OperationBoundsVisual } from './tool-operation-overlay-utils'
  import type { ActiveEdgeState } from './trim-constants'
  import type { TimelineItemPointerHint } from './use-timeline-item-pointer-handlers.svelte'
  import type { ClipTrimInfoLabel } from './use-clip-readout-labels.svelte'
  import type { CaptionDialogState } from './use-caption-dialog-state.svelte'

  interface ClipFloatingLayerProps {
    transform: HTMLDivElement | null
    ghost?: HTMLDivElement | null
    showFollowerDragGhost: boolean
    visualLeftFrame: number
    visualWidthFrames: number
    dragOffset: { x: number; y: number }
    trimInfoLabel: ClipTrimInfoLabel | null
    moveInfoLabel: string | null
    trackPushEnabled: boolean
    isTrackPushActive: boolean
    trackPushClipLeftStyle: string
    trackPushZoneStyle: string
    onTrackPushStart: (e: MouseEvent) => void
    toolOperationOverlay: OperationBoundsVisual | null
    activeEdges: ActiveEdgeState | null
    transitionDropGhost: { left: number; width: number; cutOffset: number } | null
    left: number
    width: number
    pointerHint: TimelineItemPointerHint | null
    itemMediaId: string | undefined
    hasGeneratedCaptions: boolean
    caption: CaptionDialogState
    onGenerateCaption: ComponentProps<typeof TranscribeDialogController>['onGenerate']
  }

  /**
   * Overlays that anchor to a timeline clip but render as siblings outside its
   * `contain: paint` box: trim/move readouts, the track-push affordance, the
   * tool-operation bounds box, edge halos, the transition drop ghost, alt-drag
   * ghosts, the drag-blocked tooltip, and the transcription dialog controller.
   */
  let {
    transform,
    ghost = $bindable(null),
    showFollowerDragGhost,
    visualLeftFrame,
    visualWidthFrames,
    dragOffset,
    trimInfoLabel,
    moveInfoLabel,
    trackPushEnabled,
    isTrackPushActive,
    trackPushClipLeftStyle,
    trackPushZoneStyle,
    onTrackPushStart,
    toolOperationOverlay,
    activeEdges,
    transitionDropGhost,
    left,
    width,
    pointerHint,
    itemMediaId,
    hasGeneratedCaptions,
    caption,
    onGenerateCaption,
  }: ClipFloatingLayerProps = $props()
</script>

{#if trimInfoLabel}
  <TrimInfoOverlay
    anchor={transform}
    side={trimInfoLabel.side}
    delta={trimInfoLabel.delta}
    duration={trimInfoLabel.duration}
    measureKey={`${visualLeftFrame}:${visualWidthFrames}:${trimInfoLabel.side}:${trimInfoLabel.delta}:${trimInfoLabel.duration}`}
  />
{/if}

{#if moveInfoLabel}
  <FloatingReadout
    anchor={transform}
    measureKey={`move:${dragOffset.x}:${dragOffset.y}:${moveInfoLabel}`}
    offsetY={6}
  >
    {moveInfoLabel}
  </FloatingReadout>
{/if}

<!-- Track push handle - sits in the gap to the LEFT of the clip, outside contain:paint -->
<TrackPushHandle
  enabled={trackPushEnabled}
  isActive={isTrackPushActive}
  clipLeftStyle={trackPushClipLeftStyle}
  zoneStyle={trackPushZoneStyle}
  onMouseDown={onTrackPushStart}
/>

<ToolOperationOverlay visual={toolOperationOverlay} />

<!-- Active edge halos - top layer, above both clip and bounds box -->
<EdgeHalos {activeEdges} {visualLeftFrame} {visualWidthFrames} />

<TransitionDropGhost ghost={transitionDropGhost} />

<!-- Alt-drag ghosts -->
{#if showFollowerDragGhost}
  <FollowerDragGhost bind:ref={ghost} {left} {width} />
{/if}

<DragBlockedTooltip hint={pointerHint} />
<TranscribeDialogController
  {itemMediaId}
  {hasGeneratedCaptions}
  {caption}
  onGenerate={onGenerateCaption}
/>
