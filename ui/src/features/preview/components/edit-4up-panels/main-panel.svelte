<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { EditTwoUpPanelData } from '../edit-2up-panels'
  import { CompositionFrame, VideoFrame, ImageFrame, TypePlaceholder } from '../edit-2up-panels'
  import {
    getItemAspectRatio,
    computeFittedMediaSize,
    PANEL_MEDIA,
    renderPanelMedia,
  } from '../edit-panel-media-utils'

  interface MainPanelProps {
    data: EditTwoUpPanelData
    areaHeight: number
    panelWidth: number
  }

  let { data, areaHeight, panelWidth }: MainPanelProps = $props()
  const ar = $derived(getItemAspectRatio(data.item))
  const { mediaWidth, mediaHeight } = $derived(computeFittedMediaSize(panelWidth, areaHeight, ar))
  const media = $derived(
    renderPanelMedia(data.item, data.sourceTime, data.placeholderText, PANEL_MEDIA, data.sourceFrame),
  )
</script>

<div class="flex-1 min-w-0 flex flex-col items-center justify-center">
  <span
    class="text-base font-semibold tracking-widest text-white/80 uppercase pb-1"
  >
    {data.label}
  </span>
  <div
    class="flex items-center justify-center shrink-0 bg-black"
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
    {data.timecode}
  </span>
</div>
