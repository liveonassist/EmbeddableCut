<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import type { AudioFadeHandle } from '@/features/timeline/utils/audio-fade'
  import VideoFadeHandles from '../video-fade-handles.svelte'
  import type { VideoFadeEditState } from '../use-fade-editors.svelte'

  interface VideoFadeHandleLayerProps {
    isVisualFadeItem: boolean
    trackLocked: boolean
    activeTool: string
    lineYPercent: number
    fadeInRatio: number
    fadeOutRatio: number
    isSelected: boolean
    videoFadeEdit: VideoFadeEditState | null
    fadeInLabel: string
    fadeOutLabel: string
    onFadeHandleMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
    onFadeHandleDoubleClick: (handle: AudioFadeHandle) => void
  }

  /** Video fade drag handles. */
  let {
    isVisualFadeItem,
    trackLocked,
    activeTool,
    lineYPercent,
    fadeInRatio,
    fadeOutRatio,
    isSelected,
    videoFadeEdit,
    fadeInLabel,
    fadeOutLabel,
    onFadeHandleMouseDown,
    onFadeHandleDoubleClick,
  }: VideoFadeHandleLayerProps = $props()
</script>

{#if isVisualFadeItem}
  <div
    class="absolute inset-x-0 bottom-0 z-30 pointer-events-none"
    style:top={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  >
    <VideoFadeHandles
      {trackLocked}
      {activeTool}
      {lineYPercent}
      fadeInPercent={fadeInRatio * 100}
      fadeOutPercent={fadeOutRatio * 100}
      {isSelected}
      isEditing={videoFadeEdit !== null}
      editingHandle={videoFadeEdit?.handle ?? null}
      {fadeInLabel}
      {fadeOutLabel}
      {onFadeHandleMouseDown}
      {onFadeHandleDoubleClick}
    />
  </div>
{/if}
