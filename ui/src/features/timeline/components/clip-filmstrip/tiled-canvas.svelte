<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { TILE_WIDTH } from './tiled-canvas'

  interface TiledCanvasProps {
    /** Total width of the content in pixels */
    width: number
    /** Canvas height in pixels */
    height: number
    /** Render function for each tile. tileWidth is always a whole-pixel logical width. */
    renderTile: (
      ctx: CanvasRenderingContext2D,
      tileIndex: number,
      tileOffset: number,
      tileWidth: number,
    ) => void
    /** Class name for the container */
    class?: string
    /** Version number - increment to force re-render */
    version?: string | number
    /** Visible pixel range to virtualize tile creation for very long clips */
    visibleStartPx?: number
    visibleEndPx?: number
    /** Extra tiles to keep on either side of the visible window */
    overscanTiles?: number
  }

  /**
   * Tiled Canvas Component
   *
   * Renders content across multiple canvas tiles to avoid browser canvas size limits.
   * Each tile is 1000px wide. Only creates canvases when needed.
   *
   * Separates layout (CSS positioning — runs on every width change) from content
   * rendering (canvas draw — runs only when version/renderTile changes). This
   * prevents full canvas redraws during zoom gestures where only width changes.
   */
  let {
    width,
    height,
    renderTile,
    class: className = '',
    version = 0,
    visibleStartPx,
    visibleEndPx,
    overscanTiles = 0,
  }: TiledCanvasProps = $props()

  let container = $state<HTMLDivElement | null>(null)
  const canvasPool = new Map<number, HTMLCanvasElement>()
  const lastRendered: { version: string | number; renderTile: unknown; height: number } = {
    version: -1,
    renderTile: untrack(() => renderTile) as unknown,
    height: -1,
  }

  // Calculate number of tiles needed
  const tileCount = $derived(Math.ceil(width / TILE_WIDTH))
  const hasVisibleWindow = $derived(
    Number.isFinite(visibleStartPx) && Number.isFinite(visibleEndPx),
  )
  const clampedVisibleStart = $derived(
    hasVisibleWindow ? Math.max(0, Math.min(width, visibleStartPx ?? 0)) : 0,
  )
  const clampedVisibleEnd = $derived(
    hasVisibleWindow
      ? Math.max(clampedVisibleStart, Math.min(width, visibleEndPx ?? width))
      : width,
  )
  const activeTileStart = $derived(
    hasVisibleWindow
      ? Math.max(0, Math.floor(clampedVisibleStart / TILE_WIDTH) - overscanTiles)
      : 0,
  )
  const activeTileEnd = $derived(
    hasVisibleWindow
      ? Math.min(tileCount, Math.ceil(clampedVisibleEnd / TILE_WIDTH) + overscanTiles)
      : tileCount,
  )

  $effect(() => {
    const el = container
    const currentWidth = width
    const currentHeight = height
    void tileCount
    const currentVersion = version
    const currentRenderTile = renderTile
    const tileStart = activeTileStart
    const tileEnd = activeTileEnd

    untrack(() => {
      if (!el) return

      const dpr = window.devicePixelRatio || 1
      const last = lastRendered
      const needsContentRedraw =
        currentVersion !== last.version ||
        currentRenderTile !== last.renderTile ||
        currentHeight !== last.height

      // Create or update tiles
      for (let tileIndex = tileStart; tileIndex < tileEnd; tileIndex++) {
        let canvas = canvasPool.get(tileIndex)
        const isNew = !canvas

        if (!canvas) {
          canvas = document.createElement('canvas')
          canvas.style.position = 'absolute'
          canvas.style.top = '0'
          canvas.style.left = '0'
          canvas.style.pointerEvents = 'none'
          canvas.style.willChange = 'transform'
          canvasPool.set(tileIndex, canvas)
          el.appendChild(canvas)
        }

        // Calculate tile dimensions
        const tileOffset = tileIndex * TILE_WIDTH
        const actualTileWidth = Math.max(0, Math.min(TILE_WIDTH, currentWidth - tileOffset))
        const renderTileWidth = actualTileWidth > 0 ? Math.max(1, Math.ceil(actualTileWidth)) : 0

        // Always update layout (cheap CSS — no canvas redraw)
        canvas.style.transform = `translateX(${tileOffset}px)`
        canvas.style.width = `${actualTileWidth}px`
        canvas.style.height = `${currentHeight}px`

        // Only redraw canvas content when version/renderTile/height change,
        // or when the tile is brand new. Width-only changes (zoom) skip the
        // expensive canvas draw — tiles CSS-stretch until content catches up.
        if (needsContentRedraw || isNew) {
          canvas.width = Math.ceil(renderTileWidth * dpr)
          canvas.height = Math.ceil(currentHeight * dpr)

          const ctx = canvas.getContext('2d')
          if (ctx && renderTileWidth > 0) {
            ctx.scale(dpr, dpr)
            ctx.clearRect(0, 0, renderTileWidth, currentHeight)
            currentRenderTile(ctx, tileIndex, tileOffset, renderTileWidth)
          }
        }
      }

      // Remove extra tiles that are no longer needed
      for (const [index, canvas] of canvasPool) {
        if (index < tileStart || index >= tileEnd) {
          canvas.remove()
          canvasPool.delete(index)
        }
      }

      if (needsContentRedraw) {
        last.version = currentVersion
        last.renderTile = currentRenderTile
        last.height = currentHeight
      }
    })
  })

  // Cleanup on unmount
  $effect(() => {
    return () => {
      for (const canvas of canvasPool.values()) {
        canvas.remove()
      }
      canvasPool.clear()
    }
  })
</script>

<div
  bind:this={container}
  class={`absolute inset-0 ${className}`}
  style:pointer-events="none"
></div>
