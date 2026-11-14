<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useZoomStore } from '@/features/timeline/stores/zoom-store'
  import { getDemotionAwarePixelsPerSecond } from '@/features/timeline/utils/timeline-dom-density'
  import { formatSignedFrameDelta } from '@/shared/utils/time-utils'
  import AudioClipVisualContent from './audio-clip-visual-content.svelte'
  import ImageClipVisualContent from './image-clip-visual-content.svelte'
  import MediaClipLabel from './media-clip-label.svelte'
  import VideoClipVisualContent from './video-clip-visual-content.svelte'
  import {
    MEDIA_LABEL_GAP_PX,
    MEDIA_LABEL_MIN_WIDTH_PX,
    MEDIA_LINK_ICON_MIN_WIDTH_PX,
    MEDIA_LINK_ICON_WIDTH_PX,
    MEDIA_LINKED_LABEL_MIN_WIDTH_PX,
    MEDIA_LINKED_LABEL_VISIBLE_TEXT_WIDTH_PX,
    MEDIA_LOD_LABEL,
    MEDIA_LOD_LINK_ICON,
    MEDIA_LOD_SYNC_OFFSET,
    MEDIA_LOD_VISUAL,
    getMediaVisualMinWidthPx,
    getSyncOffsetBadgeMinWidthPx,
    type ClipContentProps,
    type MediaTimelineItem,
  } from './types'

  const props: ClipContentProps = $props()

  const item = $derived(props.item)
  const clipWidthFrames = $derived(props.clipWidthFrames)
  const fps = $derived(props.fps)
  const isLinked = $derived(props.isLinked ?? false)
  const linkedSyncOffsetFrames = $derived(props.linkedSyncOffsetFrames ?? null)
  const isDetailEligible = $derived(props.isDetailEligible ?? true)

  const minVisualWidthPx = $derived(getMediaVisualMinWidthPx(item))
  const linkedSyncOffsetLabel = $derived(
    linkedSyncOffsetFrames === null ? null : formatSignedFrameDelta(linkedSyncOffsetFrames, fps),
  )
  const syncOffsetBadgeMinWidthPx = $derived(
    linkedSyncOffsetLabel === null ? null : getSyncOffsetBadgeMinWidthPx(linkedSyncOffsetLabel),
  )
  // This selector still evaluates on live zoom updates, but its integer bitmask
  // changes only when the clip crosses a real-pixel detail boundary. Expensive
  // filmstrips, waveforms, labels, and icons therefore demote across the gesture
  // instead of batching hundreds of updates into the settle frame.
  const mediaLod = $derived.by(() => {
    const widthFrames = clipWidthFrames
    const fpsValue = fps
    const detailEligible = isDetailEligible
    const linked = isLinked
    const minWidthPx = minVisualWidthPx
    const syncOffsetMinWidthPx = syncOffsetBadgeMinWidthPx
    return select(useZoomStore, (state) => {
      if (fpsValue <= 0 || !detailEligible) return 0
      const durationSeconds = widthFrames / fpsValue
      const detailPixelsPerSecond = getDemotionAwarePixelsPerSecond(
        state.contentPixelsPerSecond,
        state.pixelsPerSecond,
        state.isZoomInteracting,
      )
      const detailWidthPx = durationSeconds * detailPixelsPerSecond
      let lod = 0
      if (detailWidthPx >= minWidthPx) lod |= MEDIA_LOD_VISUAL
      if (syncOffsetMinWidthPx !== null) {
        if (detailWidthPx >= syncOffsetMinWidthPx) {
          lod |= MEDIA_LOD_SYNC_OFFSET
        }
        const syncOffsetLinkIconMinWidthPx =
          syncOffsetMinWidthPx + MEDIA_LABEL_GAP_PX + MEDIA_LINK_ICON_WIDTH_PX
        if (detailWidthPx >= syncOffsetLinkIconMinWidthPx) {
          lod |= MEDIA_LOD_LINK_ICON
        }
        const syncOffsetLabelMinWidthPx =
          syncOffsetLinkIconMinWidthPx +
          MEDIA_LABEL_GAP_PX +
          MEDIA_LINKED_LABEL_VISIBLE_TEXT_WIDTH_PX
        if (detailWidthPx >= syncOffsetLabelMinWidthPx) {
          lod |= MEDIA_LOD_LABEL
        }
      } else {
        if (detailWidthPx >= MEDIA_LINK_ICON_MIN_WIDTH_PX) lod |= MEDIA_LOD_LINK_ICON
        const labelThreshold = linked ? MEDIA_LINKED_LABEL_MIN_WIDTH_PX : MEDIA_LABEL_MIN_WIDTH_PX
        if (detailWidthPx >= labelThreshold) lod |= MEDIA_LOD_LABEL
      }
      return lod
    })
  })
  // FreeCut intersects this mask with useDeferredValue(mask) so promotion can
  // ride React's deferred lane. Svelte has no concurrent lanes: the bitmask
  // already limits updates to real-pixel threshold crossings, so promotion and
  // demotion both apply in the same flush.
  const visibleMediaLod = $derived(mediaLod.current)
  const showVisualDetail = $derived((visibleMediaLod & MEDIA_LOD_VISUAL) !== 0)
  const showLinkIcon = $derived((visibleMediaLod & MEDIA_LOD_LINK_ICON) !== 0)
  const showLabel = $derived((visibleMediaLod & MEDIA_LOD_LABEL) !== 0)
  const showSyncOffset = $derived((visibleMediaLod & MEDIA_LOD_SYNC_OFFSET) !== 0)
  const hasVisibleClipContent = $derived(
    showVisualDetail || showLinkIcon || showLabel || showSyncOffset,
  )

  const videoItem = $derived(item as MediaTimelineItem & { type: 'video' })
  const audioItem = $derived(item as MediaTimelineItem & { type: 'audio' })
  const imageItem = $derived(item as MediaTimelineItem & { type: 'image' })
</script>

<div
  class="absolute inset-0 flex flex-col"
  data-media-clip-content="true"
  hidden={!hasVisibleClipContent}
  style:display={!hasVisibleClipContent ? 'none' : undefined}
>
  <MediaClipLabel
    label={item.label}
    {isLinked}
    {linkedSyncOffsetLabel}
    {showLinkIcon}
    {showLabel}
    {showSyncOffset}
  />
  {#if showVisualDetail && item.type === 'video'}
    <VideoClipVisualContent {...props} item={videoItem} />
  {/if}
  {#if showVisualDetail && item.type === 'audio'}
    <AudioClipVisualContent {...props} item={audioItem} />
  {/if}
  {#if showVisualDetail && item.type === 'image'}
    <ImageClipVisualContent {...props} item={imageItem} />
  {/if}
</div>
