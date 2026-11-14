<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { untrack } from 'svelte'
  import type { TimelineItem } from '@/types/timeline'
  import StrictDecodedVideoFrame from './strict-decoded-video-frame.svelte'
  import LegacySeekVideoFrame from './legacy-seek-video-frame.svelte'

  const EDIT_OVERLAY_LEGACY_SEEK_SPEED_EPSILON = 0.01

  interface VideoFrameProps {
    item: TimelineItem
    sourceTime: number
  }
</script>

<script lang="ts">
  let { item: itemProp, sourceTime }: VideoFrameProps = $props()

  // React memoized this component on (sourceTime, item.id, item.mediaId): other
  // item edits keep the previous item, so the decode paths don't restart.
  let memoItem: TimelineItem | null = null
  const item = $derived.by(() => {
    if (memoItem && memoItem.id === itemProp.id && memoItem.mediaId === itemProp.mediaId) {
      return memoItem
    }
    memoItem = itemProp
    return itemProp
  })
  let useLegacyFallback = $state.raw(false)
  const setUseLegacyFallback = (next: typeof useLegacyFallback | ((prev: typeof useLegacyFallback) => typeof useLegacyFallback)) => {
    useLegacyFallback = typeof next === 'function' ? (next as (prev: typeof useLegacyFallback) => typeof useLegacyFallback)(untrack(() => useLegacyFallback)) : next
  }
  let legacyFailed = $state.raw(false)
  const setLegacyFailed = (next: typeof legacyFailed | ((prev: typeof legacyFailed) => typeof legacyFailed)) => {
    legacyFailed = typeof next === 'function' ? (next as (prev: typeof legacyFailed) => typeof legacyFailed)(untrack(() => legacyFailed)) : next
  }
  const prefersLegacySeek = $derived(Math.abs((item.speed ?? 1) - 1) < EDIT_OVERLAY_LEGACY_SEEK_SPEED_EPSILON)
  const canUseLegacySeek = $derived(!legacyFailed)

  $effect(() => {
    void [item.id, item.mediaId, prefersLegacySeek]

    setUseLegacyFallback(false)
    setLegacyFailed(false)
  })

  const handleStrictDecodeFailure = () => {
    if (!canUseLegacySeek) return
    setUseLegacyFallback((prev) => (prev ? prev : true))
  }

  const shouldUseLegacySeek = $derived(canUseLegacySeek && (prefersLegacySeek || useLegacyFallback))

  const handleLegacyFailure = () => {
    setLegacyFailed(true)
    setUseLegacyFallback(false)
  }
</script>

{#if shouldUseLegacySeek}
  <LegacySeekVideoFrame
    item={item}
    sourceTime={sourceTime}
    onFailure={handleLegacyFailure}
   />
{:else}
  <StrictDecodedVideoFrame
    item={item}
    sourceTime={sourceTime}
    onDecodeFailure={handleStrictDecodeFailure}
   />
{/if}
