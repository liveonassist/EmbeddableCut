<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '@/shared/ui/cn'
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import EffectDropOverlay from './effect-drop-overlay.svelte'
  import { getTimelineItemShellStyle } from './get-shell-style'
  import { getAudioVolumeCssVars, type AudioVolumeCssVarsParams } from './timeline-item-css-vars'
  import { getFramePositionStyle } from './timeline-item-geometry'

  interface TimelineItemShellProps {
    transform?: HTMLDivElement | null
    itemId: string
    itemType: TimelineItemType['type']
    fps: number
    visualLeftFrame: number
    visualWidthFrames: number
    isSelected: boolean
    isCompactShell: boolean
    isBeingDragged: boolean
    isStretching: boolean
    isAltDrag: boolean
    isDragging: boolean
    dragOffset: { x: number; y: number }
    shouldDimForDrag: boolean
    trackHidden: boolean
    trackLocked: boolean
    itemColorClasses: string | undefined
    cursorClass: string
    audioVolumeEdit: AudioVolumeCssVarsParams['audioVolumeEdit']
    audioVolumePreviewRef: AudioVolumeCssVarsParams['audioVolumePreviewRef']
    audioVolumeLineYPercent: number
    audioVisualizationScale: number
    isEffectDropTarget: boolean
    multiEffectDropTargetCount: number
    onHoverChange?: (itemId: string, hovered: boolean) => void
    onClick: (e: MouseEvent) => void
    onDoubleClick: (e: MouseEvent) => void
    onMouseDown: (e: MouseEvent) => void
    onMouseMove: (e: MouseEvent) => void
    onMouseLeave: () => void
    onContextMenu: (e: MouseEvent) => void
    onDragEnter: (e: DragEvent) => void
    onDragOver: (e: DragEvent) => void
    onDragLeave: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    children: Snippet
  }

  /**
   * The clip's positioned, styled and interactive shell: the absolutely placed
   * box that carries the item's geometry, selection/compact data attributes,
   * drag transform and pointer/drag handlers, plus the layers that must sit
   * above the clip body (selection ring, effect-drop overlay).
   */
  let {
    transform = $bindable(null),
    itemId,
    itemType,
    fps,
    visualLeftFrame,
    visualWidthFrames,
    isSelected,
    isCompactShell,
    isBeingDragged,
    isStretching,
    isAltDrag,
    isDragging,
    dragOffset,
    shouldDimForDrag,
    trackHidden,
    trackLocked,
    itemColorClasses,
    cursorClass,
    audioVolumeEdit,
    audioVolumePreviewRef,
    audioVolumeLineYPercent,
    audioVisualizationScale,
    isEffectDropTarget,
    multiEffectDropTargetCount,
    onHoverChange,
    onClick,
    onDoubleClick,
    onMouseDown,
    onMouseMove,
    onMouseLeave,
    onContextMenu,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    children,
  }: TimelineItemShellProps = $props()

  const shellStyle = $derived(
    getTimelineItemShellStyle({
      itemId,
      isBeingDragged,
      isAltDrag,
      isDragging,
      dragOffset,
      shouldDimForDrag,
      trackHidden,
      trackLocked,
      isCompactShell,
    }),
  )
  const audioVolumeCssVars = $derived(
    getAudioVolumeCssVars({
      itemType,
      audioVolumeEdit,
      audioVolumePreviewRef,
      audioVolumeLineYPercent,
      audioVisualizationScale,
    }),
  )
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_mouse_events_have_key_events -->
<div
  bind:this={transform}
  data-timeline-item
  data-item-id={itemId}
  data-timeline-start-frame={visualLeftFrame}
  data-timeline-duration-frames={visualWidthFrames}
  data-timeline-fps={fps}
  data-timeline-content-inset-start-px={1}
  data-timeline-content-inset-end-px={1}
  data-selected={isSelected ? 'true' : undefined}
  data-compact-clip={isCompactShell ? 'true' : undefined}
  class={cn(
    'timeline-item @container absolute inset-y-px rounded overflow-visible group/timeline-item',
    itemColorClasses,
    cursorClass,
    !isBeingDragged && !isStretching && !trackLocked && 'hover:brightness-110',
  )}
  style:left={getFramePositionStyle(visualLeftFrame)}
  style:width={getFramePositionStyle(visualWidthFrames)}
  style:transform={shellStyle.transform}
  style:opacity={shellStyle.opacity}
  style:pointer-events={shellStyle.pointerEvents}
  style:z-index={shellStyle.zIndex}
  style:transition={shellStyle.transition}
  style:contain={shellStyle.contain}
  style:content-visibility={shellStyle.contentVisibility}
  style:--timeline-audio-volume-line-y={audioVolumeCssVars['--timeline-audio-volume-line-y']}
  style:--timeline-audio-waveform-scale={audioVolumeCssVars['--timeline-audio-waveform-scale']}
  onclick={onClick}
  ondblclick={onDoubleClick}
  onmousedown={onMouseDown}
  onmouseenter={() => onHoverChange?.(itemId, true)}
  onmousemove={onMouseMove}
  onmouseleave={() => {
    onMouseLeave()
    onHoverChange?.(itemId, false)
  }}
  oncontextmenu={onContextMenu}
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <!-- Keep selection visible throughout drag so the moving cohort stays legible. -->
  {#if isSelected && !trackLocked}
    <div
      class="timeline-selection-indicator absolute inset-0 rounded pointer-events-none z-20 border border-primary"
    ></div>
  {/if}

  {#if isEffectDropTarget}
    <EffectDropOverlay multiDropCount={multiEffectDropTargetCount} />
  {/if}

  {@render children()}
</div>
