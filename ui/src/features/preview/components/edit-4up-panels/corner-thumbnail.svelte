<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { CompositionFrame, VideoFrame, ImageFrame, TypePlaceholder } from '../edit-2up-panels'
  import type { TimelineItem } from '@/types/timeline'
  import { PANEL_MEDIA, renderPanelMedia } from '../edit-panel-media-utils'

  interface CornerThumbnailProps {
    item: TimelineItem
    sourceTime?: number
    sourceFrame?: number
    width: number
    height: number
    position: 'top-left' | 'top-right'
  }

  let { item, sourceTime, sourceFrame, width, height, position }: CornerThumbnailProps = $props()
  const positionClass = $derived(position === 'top-left' ? 'left-2 top-2' : 'right-2 top-2')
  const media = $derived(
    renderPanelMedia(item, sourceTime, undefined, PANEL_MEDIA, sourceFrame),
  )
</script>

<div
  class={`absolute ${positionClass} z-40 overflow-hidden border border-white/20 rounded-sm shadow-lg`}
  style:width="{width}px"
  style:height="{height}px"
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
