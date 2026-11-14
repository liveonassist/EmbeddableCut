<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { Snippet } from 'svelte'

  interface FloatingPanelBounds {
    x: number
    y: number
    width: number
    height: number
  }

  export interface FloatingPanelProps {
    /** Content rendered inside the panel body */
    children: Snippet
    /** Panel title shown in the drag handle header */
    title?: string
    /** Extra content rendered in the header (right side) */
    headerExtra?: Snippet
    /** Initial / default bounds when no persisted state exists */
    defaultBounds: FloatingPanelBounds
    /** Minimum width */
    minWidth?: number
    /** Minimum height */
    minHeight?: number
    /** localStorage key for persisting position & size */
    storageKey?: string
    /** Whether the panel can be resized */
    resizable?: boolean
    /** When true, panel height fits content instead of using a fixed value */
    autoHeight?: boolean
    /** When true, panel width fits content instead of using a fixed value */
    autoWidth?: boolean
    /** Called when the panel requests to close / dock */
    onClose?: () => void
    /** Additional class on the outer container */
    class?: string
  }

  const EDGE_MARGIN = 8

  function clampToViewport(bounds: FloatingPanelBounds): FloatingPanelBounds {
    const vw = window.innerWidth
    const vh = window.innerHeight
    return {
      x: Math.max(EDGE_MARGIN, Math.min(vw - bounds.width - EDGE_MARGIN, bounds.x)),
      y: Math.max(EDGE_MARGIN, Math.min(vh - bounds.height - EDGE_MARGIN, bounds.y)),
      width: Math.min(vw - EDGE_MARGIN * 2, bounds.width),
      height: Math.min(vh - EDGE_MARGIN * 2, bounds.height),
    }
  }

  function loadBounds(key: string, fallback: FloatingPanelBounds): FloatingPanelBounds {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return fallback
      const parsed = JSON.parse(raw) as Partial<FloatingPanelBounds>
      if (
        typeof parsed.x === 'number' &&
        typeof parsed.y === 'number' &&
        typeof parsed.width === 'number' &&
        typeof parsed.height === 'number'
      ) {
        return clampToViewport({
          x: parsed.x,
          y: parsed.y,
          width: parsed.width,
          height: parsed.height,
        })
      }
    } catch {
      // ignore
    }
    return fallback
  }

  function saveBounds(key: string, bounds: FloatingPanelBounds): void {
    try {
      localStorage.setItem(key, JSON.stringify(bounds))
    } catch {
      // ignore
    }
  }

  type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

  const RESIZE_CURSORS: Record<ResizeEdge, string> = {
    n: 'cursor-ns-resize',
    s: 'cursor-ns-resize',
    e: 'cursor-ew-resize',
    w: 'cursor-ew-resize',
    ne: 'cursor-nesw-resize',
    nw: 'cursor-nwse-resize',
    se: 'cursor-nwse-resize',
    sw: 'cursor-nesw-resize',
  }
</script>

<script lang="ts">
  import { Portal } from 'bits-ui'
  import { portalTarget } from '$lib/context'
  import { t } from '$lib/i18n.svelte'

  let {
    children,
    title,
    headerExtra,
    defaultBounds,
    minWidth = 160,
    minHeight = 200,
    storageKey,
    resizable = true,
    autoHeight = false,
    autoWidth = false,
    onClose,
    class: className = '',
  }: FloatingPanelProps = $props()

  const target = portalTarget()

  function initialBounds(): FloatingPanelBounds {
    const initial = storageKey ? loadBounds(storageKey, defaultBounds) : defaultBounds
    // When autoHeight/autoWidth, use small placeholders for positioning
    // so the panel isn't clamped too far. Actual size comes from content.
    const heightForLayout = autoHeight ? 100 : initial.height
    const widthForLayout = autoWidth ? 200 : initial.width
    const resolved = {
      ...initial,
      x: initial.x < 0 ? window.innerWidth - widthForLayout - EDGE_MARGIN * 4 : initial.x,
      y: initial.y < 0 ? window.innerHeight - heightForLayout - EDGE_MARGIN * 4 : initial.y,
    }
    return clampToViewport({
      ...resolved,
      width: autoWidth ? widthForLayout : Math.max(minWidth, resolved.width),
      height: autoHeight ? heightForLayout : Math.max(minHeight, initial.height),
    })
  }

  let bounds = $state<FloatingPanelBounds>(initialBounds())
  let panel = $state<HTMLDivElement | null>(null)

  let drag: {
    type: 'move' | 'resize'
    edge?: ResizeEdge
    startX: number
    startY: number
    startBounds: FloatingPanelBounds
  } | null = null

  $effect(() => {
    if (storageKey) saveBounds(storageKey, $state.snapshot(bounds))
  })

  $effect(() => {
    const height = autoHeight
    const width = autoWidth
    const handleResize = () => {
      const prev = bounds
      const effectiveHeight = height && panel ? panel.offsetHeight : prev.height
      const effectiveWidth = width && panel ? panel.offsetWidth : prev.width
      bounds = clampToViewport({ ...prev, width: effectiveWidth, height: effectiveHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  })

  $effect(() => {
    const height = autoHeight
    const width = autoWidth
    const node = panel
    if ((!height && !width) || !node) return
    const ro = new ResizeObserver(() => {
      const next = { ...bounds }
      if (height) next.height = node.offsetHeight
      if (width) next.width = node.offsetWidth
      bounds = clampToViewport(next)
    })
    ro.observe(node)
    return () => ro.disconnect()
  })

  $effect(() => {
    const height = autoHeight
    const width = autoWidth
    const minH = minHeight
    const minW = minWidth
    const handlePointerMove = (e: PointerEvent) => {
      if (!drag) return
      e.preventDefault()

      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      const s = drag.startBounds

      if (drag.type === 'move') {
        const effectiveHeight = height && panel ? panel.offsetHeight : s.height
        bounds = clampToViewport({
          x: s.x + dx,
          y: s.y + dy,
          width: s.width,
          height: effectiveHeight,
        })
        return
      }

      let { x, y, width: w, height: h } = s
      const edge = drag.edge!

      if (!width && edge.includes('e')) w = Math.max(minW, s.width + dx)
      if (!width && edge.includes('w')) {
        const newWidth = Math.max(minW, s.width - dx)
        x = s.x + (s.width - newWidth)
        w = newWidth
      }
      if (edge.includes('s')) h = Math.max(minH, s.height + dy)
      if (edge.includes('n')) {
        const newHeight = Math.max(minH, s.height - dy)
        y = s.y + (s.height - newHeight)
        h = newHeight
      }

      bounds = clampToViewport({ x, y, width: w, height: h })
    }

    const handlePointerUp = () => {
      drag = null
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  })

  function handleTitlePointerDown(e: PointerEvent) {
    e.preventDefault()
    drag = {
      type: 'move',
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...bounds },
    }
  }

  function handleResizePointerDown(edge: ResizeEdge, e: PointerEvent) {
    if (!resizable) return
    e.preventDefault()
    e.stopPropagation()
    drag = {
      type: 'resize',
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startBounds: { ...bounds },
    }
  }

  const cornerClass = (position: string) =>
    autoWidth ? `${position} w-[8px] h-[8px] !cursor-ns-resize` : `${position} w-[8px] h-[8px]`
</script>

{#snippet resizeHandle(edge: ResizeEdge, positionClass: string)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute {positionClass} {RESIZE_CURSORS[edge]} z-10"
    onpointerdown={(e) => handleResizePointerDown(edge, e)}
  ></div>
{/snippet}

<Portal to={target}>
  <div
    bind:this={panel}
    class="fixed z-40 flex flex-col rounded-lg border border-border bg-background shadow-2xl shadow-black/50 overflow-hidden {className}"
    style:left="{bounds.x}px"
    style:top="{bounds.y}px"
    style:max-width={autoWidth ? `${window.innerWidth - bounds.x - EDGE_MARGIN}px` : undefined}
    style:width={autoWidth ? undefined : `${bounds.width}px`}
    style:height={autoHeight ? undefined : `${bounds.height}px`}
  >
    {#if resizable}
      {@render resizeHandle('n', 'top-0 left-2 right-2 h-[4px]')}
      {@render resizeHandle('s', 'bottom-0 left-2 right-2 h-[4px]')}
      {#if !autoWidth}
        {@render resizeHandle('e', 'right-0 top-2 bottom-2 w-[4px]')}
        {@render resizeHandle('w', 'left-0 top-2 bottom-2 w-[4px]')}
      {/if}
      {@render resizeHandle('nw', cornerClass('top-0 left-0'))}
      {@render resizeHandle('ne', cornerClass('top-0 right-0'))}
      {@render resizeHandle('sw', cornerClass('bottom-0 left-0'))}
      {@render resizeHandle('se', cornerClass('bottom-0 right-0'))}
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex items-center justify-between gap-2 border-b border-border bg-secondary/30 px-2 py-1.5 cursor-grab active:cursor-grabbing select-none shrink-0"
      onpointerdown={handleTitlePointerDown}
    >
      <span class="text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </span>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="flex items-center gap-1" onpointerdown={(e) => e.stopPropagation()}>
        {@render headerExtra?.()}
        {#if onClose}
          <button
            type="button"
            class="h-5 w-5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
            onclick={onClose}
            aria-label={t('appShell.dockPanel')}
          >
            ×
          </button>
        {/if}
      </div>
    </div>

    <div class={autoHeight ? 'overflow-hidden' : 'flex-1 min-h-0 overflow-hidden'}>
      {@render children()}
    </div>
  </div>
</Portal>
