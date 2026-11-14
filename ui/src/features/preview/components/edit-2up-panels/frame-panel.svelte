<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { TimelineItem } from '@/types/timeline'


  interface FramePanelProps {
    item: TimelineItem | null
    sourceTime?: number
    sourceFrame?: number
    timecode: string
    label: string
    areaHeight: number
    panelWidth: number
    placeholderText?: string
  }

</script>

<script lang="ts">
  import {
    computeFittedMediaSize,
    getItemAspectRatio,
    PANEL_MEDIA,
    renderPanelMedia,
  } from '../edit-panel-media-utils'
  import CompositionFrame from './composition-frame.svelte'
  import ImageFrame from './image-frame.svelte'
  import VideoFrame from './video-frame.svelte'
  import TypePlaceholder from './type-placeholder.svelte'
  let { item, sourceTime, sourceFrame, timecode, label, areaHeight, panelWidth, placeholderText }: FramePanelProps = $props()
  const ar = $derived(getItemAspectRatio(item))
  const { mediaWidth, mediaHeight } = $derived(computeFittedMediaSize(panelWidth, areaHeight, ar))
  const media = $derived(renderPanelMedia(item, sourceTime, placeholderText, PANEL_MEDIA, sourceFrame))
</script>

<div class="flex-1 min-w-0 flex flex-col items-center justify-center">
  <span
    class="text-base font-semibold tracking-widest text-white/80 uppercase pb-1"
  >
    {label}
  </span>
  <div
    class="flex items-center justify-center shrink-0 bg-preview-letterbox"
    style:width="{panelWidth}px"
    style:height="{areaHeight}px"
  >
    <div
      class="overflow-hidden border border-white/10"
      style:width="{mediaWidth}px"
      style:height="{mediaHeight}px"
    >
      {#if media.kind === 'video'}
        {#key `${media.item.id}:${media.item.mediaId ?? 'none'}`}
          <VideoFrame item={media.item} sourceTime={media.sourceTime} />
        {/key}
      {:else if media.kind === 'image'}
        <ImageFrame item={media.item} />
      {:else if media.kind === 'composition'}
        <CompositionFrame item={media.item} sourceFrame={media.sourceFrame} />
      {:else}
        <TypePlaceholder type={media.type} text={media.text} />
      {/if}
    </div>
  </div>
  <span class="text-lg font-mono text-white/90 tabular-nums pt-1">
    {timecode}
  </span>
</div>
