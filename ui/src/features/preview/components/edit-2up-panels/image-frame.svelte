<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { TimelineItem } from '@/types/timeline'
  import { resolveMediaUrl } from '@/features/preview/utils/media-resolver'

  interface ImageFrameProps {
    item: TimelineItem
  }

  let { item: itemProp }: ImageFrameProps = $props()

  // React memoized this component on (item.id, item.mediaId).
  let memoItem: TimelineItem | null = null
  const item = $derived.by(() => {
    if (memoItem && memoItem.id === itemProp.id && memoItem.mediaId === itemProp.mediaId) {
      return memoItem
    }
    memoItem = itemProp
    return itemProp
  })
  const canvasRef: { current: HTMLCanvasElement | null } = { current: null }
  let blobUrl = $state.raw<string | null>(null)
  const setBlobUrl = (next: string | null | ((prev: string | null) => string | null)) => {
    blobUrl = typeof next === 'function' ? (next as (prev: string | null) => string | null)(untrack(() => blobUrl)) : next
  }

  $effect(() => {
    let cancelled = false
    if (!item.mediaId) return

    resolveMediaUrl(item.mediaId).then((url) => {
      if (!cancelled && url) setBlobUrl(url)
    })

    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!blobUrl) return
    const canvas = canvasRef.current
    if (!canvas) return

    const img = new Image()
    img.onload = () => {
      canvas.width = img.naturalWidth || 280
      canvas.height = img.naturalHeight || 158
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
    img.src = blobUrl

    return () => {
      img.onload = null
    }
  })
</script>

<canvas bind:this={canvasRef.current} class="w-full h-full object-contain"></canvas>
