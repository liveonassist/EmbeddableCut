<!-- SPDX-License-Identifier: MIT -->
<!--
  A clip that always shows the frame another clip does, as a blurred copy behind it: paints the
  other's `<video>`, so the source is decoded once. The renderer reads that same element for it.
-->
<script lang="ts">
  import { usePlaybackStore } from '@/runtime/composition-runtime/deps/stores'
  import {
    getBestDomVideoElementForItem,
    hasDomVideoElement,
    registerDomVideoElement,
    subscribeDomVideoElements,
    unregisterDomVideoElement,
  } from '@/runtime/composition-runtime/utils/dom-video-element-registry'

  let {
    itemId,
    twinId,
    onMissing,
  }: {
    itemId: string
    twinId: string
    /** The twin has no video, e.g. because it decodes some other way. */
    onMissing: () => void
  } = $props()

  /** The widest the copy is painted: what's on screen is smaller than most sources. */
  const MAX_WIDTH = 1920
  /** How long the twin, mounted alongside this, has to get its video element. */
  const TWIN_TIMEOUT_MS = 1000
  /** How often to look whether that element has a picture yet. */
  const POLL_MS = 100

  let canvas = $state<HTMLCanvasElement | null>(null)
  let element = $state.raw<HTMLVideoElement | null>(null)

  // The twin's element, as it comes, goes or is handed over.
  $effect(() => {
    const id = twinId
    let timer: number | undefined
    let missingSince = performance.now()
    const update = () => {
      clearTimeout(timer)
      element = getBestDomVideoElementForItem(id) ?? null
      if (element || hasDomVideoElement(id)) {
        missingSince = performance.now()
      } else if (performance.now() - missingSince > TWIN_TIMEOUT_MS) {
        onMissing()
        return
      }
      if (!element) timer = window.setTimeout(update, POLL_MS)
    }
    const unsubscribe = subscribeDomVideoElements(id, update)
    update()
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  })

  $effect(() => {
    const video = element
    const surface = canvas
    const id = itemId
    if (!video || !surface) return
    const context = surface.getContext('2d')
    registerDomVideoElement(id, video)

    const paint = () => {
      if (!context || video.readyState < 2 || video.videoWidth === 0) return
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      if (surface.width !== width) surface.width = width
      if (surface.height !== height) surface.height = height
      context.drawImage(video, 0, 0, width, height)
    }

    let handle = 0
    const onFrame = () => {
      // The rendered overlay is showing instead.
      if (!usePlaybackStore.getState().compositionVisualFrozen) paint()
      handle = video.requestVideoFrameCallback(onFrame)
    }
    handle = video.requestVideoFrameCallback(onFrame)
    const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
      if (previous.compositionVisualFrozen && !state.compositionVisualFrozen) paint()
    })
    video.addEventListener('loadeddata', paint)
    video.addEventListener('seeked', paint)
    paint()

    return () => {
      video.cancelVideoFrameCallback(handle)
      unsubscribe()
      video.removeEventListener('loadeddata', paint)
      video.removeEventListener('seeked', paint)
      unregisterDomVideoElement(id, video)
    }
  })
</script>

<canvas
  bind:this={canvas}
  data-item-id={itemId}
  style="width: 100%; height: 100%; object-fit: fill; display: block;"
></canvas>
