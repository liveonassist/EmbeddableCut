<!-- SPDX-License-Identifier: MIT -->
<!--
  Canvas component for rendering GIF frames

  Uses canvas.drawImage for efficient ImageBitmap rendering
  Handles different fit modes (cover, contain, fill)
-->
<script lang="ts">
  let {
    frame,
    fit,
    style,
  }: {
    /** The ImageBitmap frame to render */
    frame: ImageBitmap | null
    /** How to fit the frame within the container */
    fit: 'cover' | 'contain' | 'fill'
    /** Additional styles */
    style?: string
  } = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let container = $state<HTMLDivElement | null>(null)

  $effect(() => {
    const current = frame
    const fitMode = fit
    if (!canvas || !container || !current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Use offsetWidth/offsetHeight — these return layout dimensions BEFORE
    // CSS transforms (rotation/scale).  getBoundingClientRect() returns the
    // axis-aligned bounding box AFTER transforms, which distorts the canvas
    // pixel buffer when the item is rotated via the gizmo.
    const containerWidth = container.offsetWidth
    const containerHeight = container.offsetHeight

    // Skip drawing when container is hidden or detached (zero dimensions)
    if (containerWidth === 0 || containerHeight === 0) return

    // Set canvas size to match container
    if (canvas.width !== containerWidth || canvas.height !== containerHeight) {
      canvas.width = containerWidth
      canvas.height = containerHeight
    }

    // Clear previous frame
    ctx.clearRect(0, 0, containerWidth, containerHeight)

    // Calculate draw dimensions based on fit mode
    let dx = 0
    let dy = 0
    let dw = containerWidth
    let dh = containerHeight

    if (fitMode === 'contain' || fitMode === 'cover') {
      const scaleX = containerWidth / current.width
      const scaleY = containerHeight / current.height
      const scale = fitMode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)

      dw = current.width * scale
      dh = current.height * scale
      dx = (containerWidth - dw) / 2
      dy = (containerHeight - dh) / 2
    }

    // Guard against detached ImageBitmaps (can happen when the cache
    // evicts entries or the user clears caches while frames are displayed).
    try {
      ctx.drawImage(current, dx, dy, dw, dh)
    } catch {
      // ImageBitmap was closed/detached — ignore, next frame update will fix it
    }
  })
</script>

<div
  bind:this={container}
  style="width: 100%; height: 100%; position: relative;{style ? ` ${style}` : ''}"
>
  <canvas bind:this={canvas} style="width: 100%; height: 100%; display: block;"></canvas>
</div>
