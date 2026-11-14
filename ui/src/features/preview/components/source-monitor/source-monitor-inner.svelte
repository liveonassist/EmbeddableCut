<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import { select } from '$lib/store.svelte'
  import X from 'lucide-svelte/icons/x'
  import { SourceComposition } from '../source-composition'
  import { getExclusiveSourceOutPoint } from '@/features/preview/utils/source-io'
  import { useSettingsStore } from '@/features/preview/deps/settings'
  import { useSourcePlayerStore } from '@/shared/state/source-player'
  import { EDITOR_LAYOUT_CSS_VALUES, getEditorLayout } from '@/config/editor-layout'
  import { getPreviewPixelSnapSize } from '@/features/preview/utils/preview-pixel-snap'
  import SourcePlaybackControls from './source-playback-controls.svelte'

  const SOURCE_MONITOR_RESIZE_MIN_UPDATE_MS = 33

  function getDevicePixelRatio(): number {
    return typeof window === 'undefined' ? 1 : window.devicePixelRatio
  }

  // -- Inner component (rendered inside provider tree) --

  interface SourceMonitorInnerProps {
    mediaId: string
    src: string
    mediaType: 'video' | 'audio' | 'image' | 'lottie'
    hasAudio: boolean
    fileName: string
    mediaWidth: number
    mediaHeight: number
    durationInFrames: number
    fps: number
    variant: 'panel' | 'program'
    interactive: boolean
    seekFrame: number | null
    onClose?: () => void
  }
</script>

<script lang="ts">
  let { mediaId, src, mediaType, hasAudio, fileName, mediaWidth, mediaHeight, durationInFrames, fps, variant, interactive, seekFrame, onClose }: SourceMonitorInnerProps = $props()
  const containerRef: { current: HTMLDivElement | null } = { current: null }
  const contentHostRef: { current: HTMLDivElement | null } = { current: null }
  const contentScaleRef: { current: HTMLDivElement | null } = { current: null }
  const lastLayoutRef: { current: {
    scaledWidth: number
    scaledHeight: number
    scale: number
  } | null } = { current: null }
  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))

  const updateLayout = () => {
    const container = containerRef.current
    const host = contentHostRef.current
    const scaleDiv = contentScaleRef.current
    if (!container || !host || !scaleDiv) return

    const cw = Math.max(0, container.clientWidth - editorLayout.previewPadding)
    const ch = Math.max(0, container.clientHeight - editorLayout.previewPadding)
    const scale = cw > 0 && ch > 0 ? Math.min(cw / mediaWidth, ch / mediaHeight) : 1

    const snappedSize = getPreviewPixelSnapSize(
      {
        width: mediaWidth * scale,
        height: mediaHeight * scale,
      },
      getDevicePixelRatio(),
    )
    const sw = snappedSize.width
    const sh = snappedSize.height
    const scaleX = sw / mediaWidth
    const scaleY = sh / mediaHeight
    const layoutScale = mediaType === 'audio' ? 1 : scaleX

    const previousLayout = lastLayoutRef.current
    if (
      previousLayout &&
      previousLayout.scaledWidth === sw &&
      previousLayout.scaledHeight === sh &&
      previousLayout.scale === layoutScale
    ) {
      return
    }

    lastLayoutRef.current = {
      scaledWidth: sw,
      scaledHeight: sh,
      scale: layoutScale,
    }

    host.style.width = `${sw}px`
    host.style.height = `${sh}px`
    host.style.marginLeft = `${-sw / 2}px`
    host.style.marginTop = `${-sh / 2}px`

    if (mediaType === 'audio') {
      scaleDiv.style.width = `${sw}px`
      scaleDiv.style.height = `${sh}px`
      scaleDiv.style.transform = 'none'
    } else {
      scaleDiv.style.width = `${mediaWidth}px`
      scaleDiv.style.height = `${mediaHeight}px`
      scaleDiv.style.transform = `scale(${scaleX}, ${scaleY})`
    }
  }

  $effect(() => {
    const el = containerRef.current
    if (!el) return
    let rafId: number | null = null
    let lastUpdateTs = 0
    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        const now = performance.now()
        if (now - lastUpdateTs < SOURCE_MONITOR_RESIZE_MIN_UPDATE_MS) {
          rafId = requestAnimationFrame(() => {
            rafId = null
            lastUpdateTs = performance.now()
            updateLayout()
          })
          return
        }

        rafId = null
        lastUpdateTs = now
        updateLayout()
      })
    }
    const obs = new ResizeObserver(schedule)
    obs.observe(el)
    updateLayout()
    return () => {
      obs.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  })

  // When media URL resolves, the preview host nodes mount after the initial
  // layout pass. Force one more measurement so the source appears immediately.
  $effect(() => {
    if (!src) return
    const rafId = requestAnimationFrame(() => {
      updateLayout()
    })
    return () => {
      cancelAnimationFrame(rafId)
    }
  })

  const setHoveredPanel = useSourcePlayerStore.getState().setHoveredPanel
  const setPlayerMethods = useSourcePlayerStore.getState().setPlayerMethods

  // Reset hover and player methods on unmount
  $effect(() => {
    if (!interactive) return
    return () => {
      setHoveredPanel(null)
      setPlayerMethods(null)
    }
  })

  // Handle I/O shortcuts locally on this element (not global useHotkeys)
  const wrapperRef: { current: HTMLDivElement | null } = { current: null }
  const hadFocusRef = { current: false }
  const handleKeyDown = (e: KeyboardEvent) => {
      if (!interactive) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { currentSourceFrame, setInPoint, setOutPoint, clearInOutPoints } =
        useSourcePlayerStore.getState()
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        e.stopPropagation()
        setInPoint(currentSourceFrame)
      } else if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        e.stopPropagation()
        setOutPoint(getExclusiveSourceOutPoint(currentSourceFrame, durationInFrames))
      } else if (e.altKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault()
        e.stopPropagation()
        clearInOutPoints()
      }
    }

  const handleMouseEnter = () => {
    if (!interactive) return
    setHoveredPanel('source')
    // Only grab focus if nothing meaningful is focused (avoid stealing from inputs)
    const active = document.activeElement
    if (active === document.body || wrapperRef.current?.contains(active)) {
      wrapperRef.current?.focus()
      hadFocusRef.current = true
    }
  }

  const handleMouseLeave = () => {
    if (!interactive) return
    setHoveredPanel(null)
    if (hadFocusRef.current) {
      wrapperRef.current?.blur()
      hadFocusRef.current = false
    }
  }
</script>

<div
  bind:this={wrapperRef.current}
  tabindex={-1}
  class="flex-1 flex flex-col min-w-0 outline-none"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}
  onkeydown={handleKeyDown}
>
  {#if variant === 'panel'}
    <div
      class="border-b border-border flex items-center px-3 justify-between shrink-0"
      style:height={EDITOR_LAYOUT_CSS_VALUES.previewSplitHeaderHeight}
    >
      <span class="text-xs text-muted-foreground truncate">
        Source:
        {fileName}
      </span>
      <button
        onclick={onClose}
        class="p-1 rounded hover:bg-muted transition-colors shrink-0"
        aria-label="Close source monitor"
      >
        <X class="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  {/if}
  <!-- Video area - same gradient bg as composition panel -->
  <div
    bind:this={containerRef.current}
    class="flex-1 min-h-0 relative overflow-hidden bg-video-preview-background"
  >
    {#if src}
      <div
        bind:this={contentHostRef.current}
        style:position="absolute"
        style:left="50%"
        style:top="50%"
        style:overflow="hidden"
      >
        <div bind:this={contentScaleRef.current} style:transform-origin="top left">
          <SourceComposition
            mediaId={mediaId}
            src={src}
            mediaType={mediaType}
           />
        </div>
      </div>
    {:else}
      <div
        class="flex items-center justify-center h-full text-sm text-muted-foreground"
      >
        Loading media...
      </div>
    {/if}
  </div>
  <!-- Controls bar - same height as program monitor -->
  <SourcePlaybackControls
    durationInFrames={durationInFrames}
    fps={fps}
    mediaType={mediaType}
    hasAudio={hasAudio}
    interactive={interactive}
    seekFrame={seekFrame}
   />
</div>
