<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { onDestroy } from 'svelte'

  let {
    currentFrame,
    durationInFrames,
    seek,
  }: {
    currentFrame: number
    durationInFrames: number
    seek: (frame: number) => void
  } = $props()

  const progress = $derived(durationInFrames > 0 ? (currentFrame / durationInFrames) * 100 : 0)
  let bar = $state<HTMLDivElement | null>(null)
  let dragging = false
  let mouseMoveHandler: ((ev: MouseEvent) => void) | null = null
  let mouseUpHandler: (() => void) | null = null

  function seekFromEvent(clientX: number) {
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const frame = Math.round(percentage * durationInFrames)
    seek(Math.max(0, Math.min(frame, durationInFrames - 1)))
  }

  function handleMouseDown(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragging = true
    seekFromEvent(e.clientX)

    const handleMouseMove = (ev: MouseEvent) => {
      if (dragging) {
        seekFromEvent(ev.clientX)
      }
    }

    const handleMouseUp = () => {
      dragging = false
      if (mouseMoveHandler) {
        document.removeEventListener('mousemove', mouseMoveHandler)
        mouseMoveHandler = null
      }
      if (mouseUpHandler) {
        document.removeEventListener('mouseup', mouseUpHandler)
        mouseUpHandler = null
      }
    }

    mouseMoveHandler = handleMouseMove
    mouseUpHandler = handleMouseUp
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  // Clean up document listeners on unmount
  onDestroy(() => {
    if (mouseMoveHandler) {
      document.removeEventListener('mousemove', mouseMoveHandler)
      mouseMoveHandler = null
    }
    if (mouseUpHandler) {
      document.removeEventListener('mouseup', mouseUpHandler)
      mouseUpHandler = null
    }
    dragging = false
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={bar}
  class="w-full h-2 bg-white/20 rounded cursor-pointer overflow-hidden"
  onmousedown={handleMouseDown}
>
  <div class="h-full bg-primary transition-none pointer-events-none" style:width="{progress}%"></div>
</div>
