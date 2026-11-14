<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">
  import type { CompositionInputProps } from '@/types/export'
  import { createLogger } from '@/shared/logging/logger'


  const RESOLVED_TRACK_CACHE_LIMIT = 12

  const COMPARISON_LOADING_DELAY_MS = 80

  const resolvedTrackPromiseCache = new Map<string, Promise<CompositionInputProps['tracks']>>()

  function getOrCreateResolvedTrackPromise(
    key: string,
    load: () => Promise<CompositionInputProps['tracks']>,
  ): Promise<CompositionInputProps['tracks']> {
    const cached = resolvedTrackPromiseCache.get(key)
    if (cached) {
      resolvedTrackPromiseCache.delete(key)
      resolvedTrackPromiseCache.set(key, cached)
      return cached
    }

    const promise = load().catch((error) => {
      if (resolvedTrackPromiseCache.get(key) === promise) {
        resolvedTrackPromiseCache.delete(key)
      }
      throw error
    })
    resolvedTrackPromiseCache.set(key, promise)
    while (resolvedTrackPromiseCache.size > RESOLVED_TRACK_CACHE_LIMIT) {
      const oldestKey = resolvedTrackPromiseCache.keys().next().value
      if (oldestKey === undefined) break
      resolvedTrackPromiseCache.delete(oldestKey)
    }
    return promise
  }

  function getLogger() {
    return createLogger('InlineCompositionPreview')
  }

  function reportInitializationFailure(cancelled: boolean, error: unknown): void {
    if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
      getLogger().warn('Failed to initialize inline composition renderer', { error })
    }
  }

  interface InlineCompositionPreviewProps {
    compositionId: string
    seekFrame: number | null
    containerSize: {
      width: number
      height: number
    }
    presentation?: 'workspace' | 'frame'
  }

  type InlinePresentation = NonNullable<InlineCompositionPreviewProps['presentation']>

  function cloneComparisonTracks(
    presentation: InlinePresentation,
    input: CompositionInputProps | null,
  ): CompositionInputProps['tracks'] | null {
    if (presentation !== 'frame' || !input) return null
    return structuredClone(input.tracks)
  }

  function selectResolvedTracks({
    presentation,
    comparisonTracks,
    resolvedTrackResult,
    resolutionKey,
  }: {
    presentation: InlinePresentation
    comparisonTracks: CompositionInputProps['tracks'] | null
    resolvedTrackResult: { key: string; tracks: CompositionInputProps['tracks'] } | null
    resolutionKey: string
  }): CompositionInputProps['tracks'] | null {
    if (presentation === 'frame') return comparisonTracks
    if (resolvedTrackResult?.key !== resolutionKey) return null
    return resolvedTrackResult.tracks
  }

  function getComparisonSessionKey({
    presentation,
    rendererInput,
    resolutionKey,
    width,
    height,
  }: {
    presentation: InlinePresentation
    rendererInput: CompositionInputProps | null
    resolutionKey: string
    width: number
    height: number
  }): string | null {
    if (presentation !== 'frame' || !rendererInput) return null
    return `${resolutionKey}:${width}x${height}`
  }

  function selectRendererReady(
    presentation: InlinePresentation,
    comparisonReady: boolean,
    workspaceReady: boolean,
  ): boolean {
    return presentation === 'frame' ? comparisonReady : workspaceReady
  }

  function selectLoadingVisibility(
    presentation: InlinePresentation,
    comparisonLoading: boolean,
    loading: boolean,
  ): boolean {
    return presentation === 'frame' ? comparisonLoading : loading
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import { selectDerived } from '@/features/preview/utils/select-derived.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { buildSubCompositionInput, buildSubCompositionPreviewSignature, useCompositionsStore } from '@/features/preview/deps/timeline-contract'
  import { resolveMediaUrls } from '@/features/preview/deps/media-library-contract'
  import { importCompositionRenderer, type CompositionRendererInstance } from '@/features/preview/deps/export'
  import { getPreviewNeedsOverflow, getPreviewPlayerSize } from '@/features/preview/utils/preview-pixel-snap'
  import { useBlobUrlVersion } from '@/infrastructure/browser/use-blob-url-version.svelte'
  import { useComparisonCompositionFrame } from '../use-comparison-composition-frame.svelte'
  let { compositionId, seekFrame, containerSize, presentation = 'workspace' }: InlineCompositionPreviewProps = $props()
  const composition = selectDerived(useCompositionsStore, (s) => s.compositionById[compositionId])
  const compositionGraphSignature = selectDerived(useCompositionsStore, (s) =>
    buildSubCompositionPreviewSignature(compositionId, s.compositionById))
  const zoom = select(usePlaybackStore, (s) => s.zoom)
  const useProxy = select(usePlaybackStore, (s) => s.useProxy)
  const blobUrlVersion = useBlobUrlVersion()
  const resolutionKey = $derived(`${compositionId}:${compositionGraphSignature.current}:${useProxy.current ? 'proxy' : 'source'}:${blobUrlVersion.current}`)
  let resolvedTrackResult = $state.raw<{
    key: string
    tracks: CompositionInputProps['tracks']
  } | null>(null)
  const setResolvedTrackResult = (next: {
    key: string
    tracks: CompositionInputProps['tracks']
  } | null | ((prev: {
    key: string
    tracks: CompositionInputProps['tracks']
  } | null) => {
    key: string
    tracks: CompositionInputProps['tracks']
  } | null)) => {
    resolvedTrackResult = typeof next === 'function' ? (next as (prev: {
    key: string
    tracks: CompositionInputProps['tracks']
  } | null) => {
    key: string
    tracks: CompositionInputProps['tracks']
  } | null)(untrack(() => resolvedTrackResult)) : next
  }

  const compositionInput = $derived.by(() => {
    if (!composition.current || !compositionGraphSignature.current) return null
    return buildSubCompositionInput(composition.current)
  })
  const comparisonTracks = $derived.by(() => cloneComparisonTracks(presentation, compositionInput))
  const resolvedTracks = $derived(selectResolvedTracks({
    presentation,
    comparisonTracks,
    resolvedTrackResult,
    resolutionKey,
  }))

  $effect(() => {
    void [compositionId, resolutionKey, useProxy.current]

    if (presentation === 'frame') {
      setResolvedTrackResult(null)
      return
    }
    if (!compositionInput) {
      setResolvedTrackResult(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setResolvedTrackResult(null)

    const loadResolvedTracks = async () => {
      const nextResolvedTracks = await getOrCreateResolvedTrackPromise(resolutionKey, async () => {
        return resolveMediaUrls(compositionInput.tracks, { useProxy: useProxy.current })
      })
      if (controller.signal.aborted) return
      if (!cancelled) {
        setResolvedTrackResult({ key: resolutionKey, tracks: nextResolvedTracks })
      }
    }

    void loadResolvedTracks().catch(() => {
      if (!cancelled) {
        setResolvedTrackResult({ key: resolutionKey, tracks: [] })
      }
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  })

  const compositionWidth = $derived(composition.current?.width || 640)
  const compositionHeight = $derived(composition.current?.height || 360)
  const clampedSeekFrame = $derived(Math.min(
    Math.max(1, composition.current?.durationInFrames ?? 1) - 1,
    Math.max(0, seekFrame ?? 0),
  ))
  const clampedSeekFrameRef = { current: clampedSeekFrame }
  $effect.pre(() => {
    clampedSeekFrameRef.current = clampedSeekFrame
  })

  const containerWidth = $derived(containerSize.width)
  const containerHeight = $derived(containerSize.height)
  const playerSize = $derived.by(() =>
      getPreviewPlayerSize({
        sourceSize: { width: compositionWidth, height: compositionHeight },
        containerSize: { width: containerWidth, height: containerHeight },
        zoom: zoom.current,
      }))

  const needsOverflow = $derived.by(() => getPreviewNeedsOverflow({ playerSize, containerSize, zoom: zoom.current }))

  const displayCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const rendererRef: { current: CompositionRendererInstance | null } = { current: null }
  const offscreenRef: { current: OffscreenCanvas | null } = { current: null }
  const lastPresentedFrameRef: { current: number | null } = { current: null }
  let workspaceRendererReady = $state.raw(false)
  const setWorkspaceRendererReady = (next: typeof workspaceRendererReady | ((prev: typeof workspaceRendererReady) => typeof workspaceRendererReady)) => {
    workspaceRendererReady = typeof next === 'function' ? (next as (prev: typeof workspaceRendererReady) => typeof workspaceRendererReady)(untrack(() => workspaceRendererReady)) : next
  }

  const rendererInput = $derived.by(() => {
    if (!compositionGraphSignature.current || !compositionInput || !resolvedTracks) return null
    return { ...compositionInput, tracks: resolvedTracks }
  })
  const comparisonSessionKey = $derived(getComparisonSessionKey({
    presentation,
    rendererInput,
    resolutionKey,
    width: compositionWidth,
    height: compositionHeight,
  }))
  const comparisonRendererReady = useComparisonCompositionFrame(() => ({
    enabled: presentation === 'frame',
    sessionKey: comparisonSessionKey,
    compositionId,
    input: rendererInput,
    width: compositionWidth,
    height: compositionHeight,
    useProxyMedia: useProxy.current,
    frame: clampedSeekFrame,
    displayCanvasRef,
    onError: reportInitializationFailure,
  }))
  const rendererReady = $derived(selectRendererReady(
    presentation,
    comparisonRendererReady.current,
    workspaceRendererReady,
  ))

  const renderAndPresent = async (
      renderer: CompositionRendererInstance,
      offscreen: OffscreenCanvas,
      frame: number,
    ): Promise<boolean> => {
      await renderer.renderFrame(frame)
      if (rendererRef.current !== renderer) return false
      const display = displayCanvasRef.current
      if (!display) return false
      const displayCtx = display.getContext('2d')
      if (!displayCtx) return false
      if (display.width !== offscreen.width || display.height !== offscreen.height) {
        display.width = offscreen.width
        display.height = offscreen.height
      }
      displayCtx.clearRect(0, 0, display.width, display.height)
      displayCtx.drawImage(offscreen, 0, 0, display.width, display.height)
      lastPresentedFrameRef.current = frame
      return true
    }

  $effect(() => {
    void [useProxy.current]

    if (presentation === 'frame') return
    if (!rendererInput) {
      setWorkspaceRendererReady(false)
      return
    }
    if (typeof OffscreenCanvas === 'undefined') {
      setWorkspaceRendererReady(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    let createdRenderer: CompositionRendererInstance | null = null
    setWorkspaceRendererReady(false)
    lastPresentedFrameRef.current = null

    const offscreen = new OffscreenCanvas(compositionWidth, compositionHeight)
    const ctx = offscreen.getContext('2d')
    if (!ctx) {
      return
    }

    const boot = async () => {
      try {
        const { createCompositionRenderer } = await importCompositionRenderer()
        const renderer = await createCompositionRenderer(rendererInput, offscreen, ctx, {
          mode: 'preview',
          useProxyMedia: useProxy.current,
        })
        if (cancelled) {
          renderer.dispose()
          return
        }
        createdRenderer = renderer
        rendererRef.current = renderer
        offscreenRef.current = offscreen

        if ('warmGpuPipeline' in renderer) {
          void renderer.warmGpuPipeline()
        }

        await renderer.preload({
          priorityFrame: clampedSeekFrameRef.current,
          signal: controller.signal,
        })
        if (cancelled) return
        const presented = await renderAndPresent(renderer, offscreen, clampedSeekFrameRef.current)
        if (!cancelled && presented) setWorkspaceRendererReady(true)
      } catch (error) {
        reportInitializationFailure(cancelled, error)
      }
    }

    void boot()

    return () => {
      cancelled = true
      controller.abort()
      if (createdRenderer) {
        try {
          createdRenderer.dispose()
        } catch (error) {
          getLogger().warn('Failed to dispose inline composition renderer', { error })
        }
      }
      if (rendererRef.current === createdRenderer) {
        rendererRef.current = null
        offscreenRef.current = null
      }
    }
  })

  $effect(() => {
    if (presentation === 'frame') return
    if (!rendererReady) return
    const renderer = rendererRef.current
    const offscreen = offscreenRef.current
    if (!renderer || !offscreen) return
    if (lastPresentedFrameRef.current === clampedSeekFrame) return

    let cancelled = false

    const run = async () => {
      try {
        const presented = await renderAndPresent(renderer, offscreen, clampedSeekFrame)
        if (cancelled) return
        if (!presented) return
      } catch (error) {
        if (!cancelled) {
          getLogger().debug('Inline composition frame render failed', {
            error,
            frame: clampedSeekFrame,
          })
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  })

  const isLoading = $derived(!resolvedTracks || !rendererReady)
  let showDelayedComparisonLoading = $state.raw(false)
  const setShowDelayedComparisonLoading = (next: typeof showDelayedComparisonLoading | ((prev: typeof showDelayedComparisonLoading) => typeof showDelayedComparisonLoading)) => {
    showDelayedComparisonLoading = typeof next === 'function' ? (next as (prev: typeof showDelayedComparisonLoading) => typeof showDelayedComparisonLoading)(untrack(() => showDelayedComparisonLoading)) : next
  }
  $effect(() => {
    if (presentation !== 'frame' || !isLoading) {
      setShowDelayedComparisonLoading(false)
      return
    }
    const timer = setTimeout(
      () => setShowDelayedComparisonLoading(true),
      COMPARISON_LOADING_DELAY_MS,
    )
    return () => clearTimeout(timer)
  })

  const showLoading = $derived(selectLoadingVisibility(presentation, showDelayedComparisonLoading, isLoading))
</script>

{#if !composition.current || !compositionInput}
  <div
    class="w-full h-full bg-video-preview-background flex items-center justify-center text-sm text-muted-foreground"
  >
    Loading compound clip...
  </div>
{:else if presentation === 'frame'}
  <div
    class="relative w-full h-full bg-preview-letterbox"
    aria-label="Compound clip frame preview"
  >
    <canvas
      bind:this={displayCanvasRef.current}
      width={compositionWidth}
      height={compositionHeight}
      class="block w-full h-full object-contain"
    ></canvas>
    {#if showLoading}
      <div
        class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-black/30"
      >
        Loading compound clip...
      </div>
    {/if}
  </div>
{:else}
  <div
    class="w-full h-full bg-video-preview-background relative"
    style:overflow={needsOverflow ? 'auto' : 'visible'}
    aria-label="Inline compound clip preview"
  >
    <div
      class="min-w-full min-h-full grid place-items-center"
      style:padding={`calc(${EDITOR_LAYOUT_CSS_VALUES.previewPadding} / 2)`}
    >
      <div class="relative">
        <div
          class="relative shadow-2xl overflow-hidden bg-preview-letterbox"
          style:width={`${playerSize.width}px`}
          style:height={`${playerSize.height}px`}
          style:outline="2px solid hsl(var(--border))"
          style:outline-offset="0"
        >
          <canvas
            bind:this={displayCanvasRef.current}
            width={compositionWidth}
            height={compositionHeight}
            style:width="100%"
            style:height="100%"
            style:display="block"
          ></canvas>
          {#if showLoading}
            <div
              class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-black/30"
            >
              Loading compound clip...
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
