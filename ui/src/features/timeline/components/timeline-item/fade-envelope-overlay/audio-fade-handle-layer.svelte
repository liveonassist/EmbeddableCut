<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import type { AudioFadeHandle } from '@/features/timeline/utils/audio-fade'
  import AudioFadeHandles from '../audio-fade-handles.svelte'
  import AudioVolumeControl from '../audio-volume-control.svelte'
  import type {
    AudioFadeCurveEditState,
    AudioFadeEditState,
    AudioVolumeEditState,
  } from '../use-fade-editors.svelte'
  import type { FadeMath } from '../use-fade-math.svelte'

  const FADE_VIEWBOX_WIDTH = 1000

  interface AudioFadeHandleLayerProps {
    itemType: TimelineItemType['type']
    trackLocked: boolean
    activeTool: string
    lineYPercent: number
    fadeInRatio: number
    fadeOutRatio: number
    isSelected: boolean
    audioFadeEdit: AudioFadeEditState | null
    audioFadeCurveEdit: AudioFadeCurveEditState | null
    audioVolumeEdit: AudioVolumeEditState | null
    fadeInLabel: string
    fadeOutLabel: string
    fadeInCurvePoint: FadeMath['audioFadeInCurvePoint']
    fadeOutCurvePoint: FadeMath['audioFadeOutCurvePoint']
    volumeEditLabel: string | null
    volumeEditLabelRef: { current: HTMLElement | null }
    onFadeHandleMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
    onFadeHandleDoubleClick: (handle: AudioFadeHandle) => void
    onFadeCurveDotMouseDown: (e: MouseEvent, handle: AudioFadeHandle) => void
    onFadeCurveDotDoubleClick: (handle: AudioFadeHandle) => void
    onVolumeMouseDown: (e: MouseEvent) => void
    onVolumeDoubleClick: () => void
  }

  /** Audio fade handles, envelope curve dots and the volume control. */
  let {
    itemType,
    trackLocked,
    activeTool,
    lineYPercent,
    fadeInRatio,
    fadeOutRatio,
    isSelected,
    audioFadeEdit,
    audioFadeCurveEdit,
    audioVolumeEdit,
    fadeInLabel,
    fadeOutLabel,
    fadeInCurvePoint,
    fadeOutCurvePoint,
    volumeEditLabel,
    volumeEditLabelRef,
    onFadeHandleMouseDown,
    onFadeHandleDoubleClick,
    onFadeCurveDotMouseDown,
    onFadeCurveDotDoubleClick,
    onVolumeMouseDown,
    onVolumeDoubleClick,
  }: AudioFadeHandleLayerProps = $props()

  const fadeInCurveDot = $derived(
    fadeInRatio > 0 && fadeInCurvePoint
      ? {
          xPercent: (fadeInCurvePoint.x / FADE_VIEWBOX_WIDTH) * 100,
          yPercent: fadeInCurvePoint.y,
        }
      : null,
  )
  const fadeOutCurveDot = $derived(
    fadeOutRatio > 0 && fadeOutCurvePoint
      ? {
          xPercent: (fadeOutCurvePoint.x / FADE_VIEWBOX_WIDTH) * 100,
          yPercent: fadeOutCurvePoint.y,
        }
      : null,
  )
</script>

{#if itemType === 'audio'}
  <div
    class="absolute inset-x-0 bottom-0 z-30 pointer-events-none"
    style:top={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  >
    <AudioFadeHandles
      {trackLocked}
      {activeTool}
      {lineYPercent}
      fadeInPercent={fadeInRatio * 100}
      fadeOutPercent={fadeOutRatio * 100}
      {isSelected}
      isEditing={audioFadeEdit !== null}
      editingHandle={audioFadeEdit?.handle ?? null}
      curveEditingHandle={audioFadeCurveEdit?.handle ?? null}
      {fadeInLabel}
      {fadeOutLabel}
      {fadeInCurveDot}
      {fadeOutCurveDot}
      {onFadeHandleMouseDown}
      {onFadeHandleDoubleClick}
      {onFadeCurveDotMouseDown}
      {onFadeCurveDotDoubleClick}
    />
    <AudioVolumeControl
      {trackLocked}
      {activeTool}
      {lineYPercent}
      isEditing={audioVolumeEdit !== null}
      editLabel={volumeEditLabel}
      editLabelRef={volumeEditLabelRef}
      {onVolumeMouseDown}
      {onVolumeDoubleClick}
    />
  </div>
{/if}
