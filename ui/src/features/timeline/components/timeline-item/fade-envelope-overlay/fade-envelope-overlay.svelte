<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem as TimelineItemType } from '@/types/timeline'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { AUDIO_ENVELOPE_VIEWBOX_HEIGHT } from '../timeline-item-css-vars'

  const FADE_VIEWBOX_WIDTH = 1000

  interface FadeEnvelopeOverlayProps {
    itemType: TimelineItemType['type']
    isVisualFadeItem: boolean
    videoControlsRef: { current: HTMLDivElement | null }
    audioControlsRef: { current: HTMLDivElement | null }
    volumeLineRef: { current: HTMLDivElement | null }
    videoFadeInRatio: number
    videoFadeOutRatio: number
    videoFadeInPath: string
    videoFadeOutPath: string
    audioFadeInRatio: number
    audioFadeOutRatio: number
    audioFadeInCurvePath: string
    audioFadeOutCurvePath: string
    audioVolumeLineYPercent: number
    audioVolumeLineStroke: string
  }

  /** Fade/envelope backdrops drawn behind the clip content. */
  let {
    itemType,
    isVisualFadeItem,
    videoControlsRef,
    audioControlsRef,
    volumeLineRef,
    videoFadeInRatio,
    videoFadeOutRatio,
    videoFadeInPath,
    videoFadeOutPath,
    audioFadeInRatio,
    audioFadeOutRatio,
    audioFadeInCurvePath,
    audioFadeOutCurvePath,
    audioVolumeLineYPercent,
    audioVolumeLineStroke,
  }: FadeEnvelopeOverlayProps = $props()
</script>

{#if isVisualFadeItem}
  <div
    bind:this={videoControlsRef.current}
    class="absolute inset-x-0 bottom-0 pointer-events-none z-10"
    style:top={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  >
    <svg
      class="absolute inset-0 h-full w-full"
      viewBox="0 0 {FADE_VIEWBOX_WIDTH} {AUDIO_ENVELOPE_VIEWBOX_HEIGHT}"
      preserveAspectRatio="none"
    >
      {#if videoFadeInRatio > 0}<path d={videoFadeInPath} fill="rgba(15,23,42,0.46)" />{/if}
      {#if videoFadeOutRatio > 0}<path d={videoFadeOutPath} fill="rgba(15,23,42,0.46)" />{/if}
    </svg>
  </div>
{/if}

{#if itemType === 'audio'}
  <div
    bind:this={audioControlsRef.current}
    class="absolute inset-x-0 bottom-0 pointer-events-none z-10"
    style:top={EDITOR_LAYOUT_CSS_VALUES.timelineClipLabelRowHeight}
  >
    <div
      bind:this={volumeLineRef.current}
      class="absolute left-0 right-0 pointer-events-none"
      style:height="1px"
      style:top="var(--timeline-audio-volume-line-y, {audioVolumeLineYPercent}%)"
      style:background-color={audioVolumeLineStroke}
    ></div>
    <svg
      class="absolute inset-0 h-full w-full"
      viewBox="0 0 {FADE_VIEWBOX_WIDTH} {AUDIO_ENVELOPE_VIEWBOX_HEIGHT}"
      preserveAspectRatio="none"
    >
      {#if audioFadeInRatio > 0}<path d={audioFadeInCurvePath} fill="rgba(0,0,0,0.5)" />{/if}
      {#if audioFadeOutRatio > 0}<path d={audioFadeOutCurvePath} fill="rgba(0,0,0,0.5)" />{/if}
    </svg>
  </div>
{/if}
