<!-- SPDX-License-Identifier: MIT -->
<script module lang="ts">

  const SAMPLE_WIDTH_PAUSED = 384

  const SAMPLE_HEIGHT_PAUSED = 216

  const SAMPLE_WIDTH_PLAYING = 256

  const SAMPLE_HEIGHT_PLAYING = 144

  const GPU_INTERVAL = 66

   // ~15fps
  const CPU_INTERVAL = 220

  // Watchdog: if a render stays "in flight" past this, assume its capture await
  // wedged (e.g. cold-start scrub-lock contention whose `finally` never ran) and
  // force-clear the gate so the render loop recovers instead of freezing forever.
  const GPU_RENDER_STUCK_TIMEOUT_MS = 1000

  const STACK_LAYOUT_STORAGE_KEY = 'timeline:scopes:stackLayout'

  // Resolve-style RGB parade: three roughly square waveform lanes side by side.
  const PARADE_SCOPE_ASPECT_RATIO = 10 / 3

  interface GpuCanvasContextCacheEntry {
    ctx: GPUCanvasContext
    width: number
    height: number
  }

  type ScopeColorMatrix = 'bt709' | 'bt601'

  type ScopeRangeMode = 'full' | 'legal'

  // Browser compositing is effectively sRGB/Rec.709 full-range, so the scopes
  // use fixed coefficients — like DaVinci, no matrix/range toggles in the
  // toolbar (Resolve keeps such options behind its scope settings menu).
  const SCOPE_COLOR_MATRIX: ScopeColorMatrix = 'bt709'

  const SCOPE_RANGE_MODE: ScopeRangeMode = 'full'

  type ScopeViewMode = 'rgb' | 'r' | 'g' | 'b' | 'luma'

  // DaVinci-style scope picker: one scope at a time. Only the visible scope
  // mounts and renders.
  type StackScopeView = 'waveform' | 'parade' | 'vectorscope' | 'histogram'

  const STACK_SCOPE_VIEWS: ReadonlyArray<{ value: StackScopeView; label: string }> = [
    { value: 'waveform', label: 'Waveform' },
    { value: 'parade', label: 'Parade' },
    { value: 'vectorscope', label: 'Vectorscope' },
    { value: 'histogram', label: 'Histogram' },
  ]

  const VIEW_MODE_NUM: Record<ScopeViewMode, number> = { rgb: 0, r: 1, g: 2, b: 3, luma: 4 }

  interface MatrixCoefficients {
    kr: number
    kb: number
  }

  function getMatrixCoefficients(matrix: ScopeColorMatrix): MatrixCoefficients {
    return matrix === 'bt601' ? { kr: 0.299, kb: 0.114 } : { kr: 0.2126, kb: 0.0722 }
  }

  function loadStackView(): StackScopeView {
    try {
      const v = localStorage.getItem(STACK_LAYOUT_STORAGE_KEY)
      if (STACK_SCOPE_VIEWS.some((view) => view.value === v)) return v as StackScopeView
    } catch {
      /* ignore */
    }
    return 'parade'
  }

  // ── CPU fallback drawing functions ──────────────────────────────────────────

  function normalizeRange(value: number, rangeMode: ScopeRangeMode): number {
    if (rangeMode === 'legal') {
      const legalMin = 16 / 255
      const legalMax = 235 / 255
      return Math.max(0, Math.min(1, (value - legalMin) / (legalMax - legalMin)))
    }
    return Math.max(0, Math.min(1, value))
  }

  function drawIreGrid(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)'
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    for (const level of [0, 25, 50, 75, 100]) {
      const y = Math.round(height - 1 - (level / 100) * (height - 1))
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(width, y + 0.5)
      ctx.stroke()
      ctx.fillText(String(level), 4, Math.max(10, y - 2))
    }
    ctx.restore()
  }

  function forEachScopePixel(
    imageData: ImageData,
    callback: (x: number, y: number, r: number, g: number, b: number) => void,
  ): void {
    const { data, width, height } = imageData
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        callback(x, y, (data[idx] ?? 0) / 255, (data[idx + 1] ?? 0) / 255, (data[idx + 2] ?? 0) / 255)
      }
    }
  }

  function cpuDrawWaveform(
    imageData: ImageData,
    ctx: CanvasRenderingContext2D,
    matrix: ScopeColorMatrix,
    rangeMode: ScopeRangeMode,
    w: number,
    h: number,
  ): void {
    const { kr, kb } = getMatrixCoefficients(matrix)
    const kg = 1 - kr - kb
    const { width } = imageData
    const density = new Uint16Array(w * h)
    let maxD = 0
    forEachScopePixel(imageData, (x, _y, r, g, b) => {
      const luma = normalizeRange(kr * r + kg * g + kb * b, rangeMode)
      const px = Math.floor((x / Math.max(1, width - 1)) * (w - 1))
      const py = h - 1 - Math.floor(luma * (h - 1))
      const di = py * w + px
      const next = (density[di] ?? 0) + 1
      density[di] = next
      if (next > maxD) maxD = next
    })
    const image = ctx.createImageData(w, h)
    const out = image.data
    const logDiv = Math.log1p(Math.max(1, maxD))
    for (let i = 0; i < density.length; i++) {
      const bucket = density[i] ?? 0
      if (bucket <= 0) continue
      const d = Math.log1p(bucket) / logDiv
      if (d <= 0) continue
      const oi = i * 4
      out[oi] = 40
      out[oi + 1] = Math.min(255, Math.round(65 + d * 190))
      out[oi + 2] = 120
      out[oi + 3] = Math.min(255, Math.round(95 + d * 160))
    }
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, w, h)
    ctx.putImageData(image, 0, 0)
    drawIreGrid(ctx, w, h)
  }

  function cpuDrawParade(
    imageData: ImageData,
    ctx: CanvasRenderingContext2D,
    rangeMode: ScopeRangeMode,
    w: number,
    h: number,
  ): void {
    const { data, width, height } = imageData
    const density = new Uint16Array(w * h)
    let maxD = 0
    const sW = Math.floor(w / 3)
    const colors: Array<[number, number, number]> = [
      [255, 80, 80],
      [60, 255, 120],
      [90, 130, 255],
    ]
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const ch = [(data[idx] ?? 0) / 255, (data[idx + 1] ?? 0) / 255, (data[idx + 2] ?? 0) / 255]
        const lx = Math.floor((x / Math.max(1, width - 1)) * (sW - 1))
        for (let c = 0; c < 3; c++) {
          const v = normalizeRange(ch[c] ?? 0, rangeMode)
          const px = c * sW + lx
          const py = h - 1 - Math.floor(v * (h - 1))
          const di = py * w + px
          const next = (density[di] ?? 0) + 1
          density[di] = next
          if (next > maxD) maxD = next
        }
      }
    }
    const image = ctx.createImageData(w, h)
    const out = image.data
    const logDiv = Math.log1p(Math.max(1, maxD))
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const bucket = density[i] ?? 0
        if (bucket <= 0) continue
        const d = Math.log1p(bucket) / logDiv
        const channel = Math.min(2, Math.floor(x / Math.max(1, sW)))
        const color = colors[channel] ?? [180, 180, 180]
        const oi = i * 4
        out[oi] = Math.min(255, Math.round((color[0] ?? 180) * (0.25 + 0.75 * d)))
        out[oi + 1] = Math.min(255, Math.round((color[1] ?? 180) * (0.25 + 0.75 * d)))
        out[oi + 2] = Math.min(255, Math.round((color[2] ?? 180) * (0.25 + 0.75 * d)))
        out[oi + 3] = Math.min(255, Math.round(85 + d * 160))
      }
    }
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, w, h)
    ctx.putImageData(image, 0, 0)
    drawIreGrid(ctx, w, h)
    ctx.save()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'
    ctx.lineWidth = 1
    for (let n = 1; n < 3; n++) {
      const xp = n * sW
      ctx.beginPath()
      ctx.moveTo(xp + 0.5, 0)
      ctx.lineTo(xp + 0.5, h)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(148, 163, 184, 0.9)'
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    ctx.fillText('R', 8, 12)
    ctx.fillText('G', sW + 8, 12)
    ctx.fillText('B', sW * 2 + 8, 12)
    ctx.restore()
  }

  function cpuDrawHistogram(
    imageData: ImageData,
    ctx: CanvasRenderingContext2D,
    matrix: ScopeColorMatrix,
    rangeMode: ScopeRangeMode,
    w: number,
    h: number,
  ): void {
    const { kr, kb } = getMatrixCoefficients(matrix)
    const kg = 1 - kr - kb
    const bins = new Uint32Array(256)
    let maxBin = 0
    forEachScopePixel(imageData, (_x, _y, r, g, b) => {
      const luma = normalizeRange(kr * r + kg * g + kb * b, rangeMode)
      const bin = Math.max(0, Math.min(255, Math.round(luma * 255)))
      const next = (bins[bin] ?? 0) + 1
      bins[bin] = next
      if (next > maxBin) maxBin = next
    })
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, w, h)
    drawIreGrid(ctx, w, h)
    const logDiv = Math.log1p(Math.max(1, maxBin))
    for (let i = 0; i < 256; i++) {
      const bucket = bins[i] ?? 0
      if (bucket <= 0) continue
      const strength = Math.log1p(bucket) / logDiv
      const x = Math.round((i / 255) * (w - 1))
      const barH = Math.max(1, Math.round(strength * (h - 1)))
      ctx.fillStyle = `rgba(116, 232, 195, ${0.35 + strength * 0.65})`
      ctx.fillRect(x, h - barH, Math.max(1, Math.round(w / 256)), barH)
    }
  }

  function cpuDrawVectorscope(
    imageData: ImageData,
    ctx: CanvasRenderingContext2D,
    matrix: ScopeColorMatrix,
    size: number,
  ): void {
    const { kr, kb } = getMatrixCoefficients(matrix)
    const kg = 1 - kr - kb
    const density = new Uint32Array(size * size)
    let maxD = 0
    const center = Math.floor(size / 2)
    const radius = center - 2
    forEachScopePixel(imageData, (_x, _y, r, g, b) => {
      const yP = kr * r + kg * g + kb * b
      const cb = (b - yP) / (2 * (1 - kb))
      const cr = (r - yP) / (2 * (1 - kr))
      const px = Math.round(center + cb * radius * 2)
      const py = Math.round(center - cr * radius * 2)
      if (px < 0 || px >= size || py < 0 || py >= size) return
      const di = py * size + px
      const next = (density[di] ?? 0) + 1
      density[di] = next
      if (next > maxD) maxD = next
    })
    ctx.fillStyle = '#030712'
    ctx.fillRect(0, 0, size, size)
    const image = ctx.createImageData(size, size)
    const out = image.data
    const logDiv = Math.log1p(Math.max(1, maxD))
    for (let i = 0; i < density.length; i++) {
      const bucket = density[i] ?? 0
      if (bucket <= 0) continue
      const d = Math.log1p(bucket) / logDiv
      if (d <= 0) continue
      const oi = i * 4
      out[oi] = 70
      out[oi + 1] = Math.min(255, Math.round(70 + d * 185))
      out[oi + 2] = 255
      out[oi + 3] = Math.min(255, Math.round(90 + d * 165))
    }
    ctx.putImageData(image, 0, 0)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(center, center, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(center, center, Math.floor(radius * 0.66), 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(center, 0)
    ctx.lineTo(center, size)
    ctx.moveTo(0, center)
    ctx.lineTo(size, center)
    ctx.stroke()
  }

  // ── Shared helpers ──────────────────────────────────────────────────────────

  function ensureCanvasSize(
    canvas: HTMLCanvasElement,
    fallbackW: number,
    fallbackH: number,
    maxW: number,
    maxH: number,
  ): { width: number; height: number } {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(2, Math.min(maxW, Math.round(rect.width || fallbackW)))
    const height = Math.max(2, Math.min(maxH, Math.round(rect.height || fallbackH)))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    return { width, height }
  }

  // ── GPU canvas sizing ───────────────────────────────────────────────────────

  function useGpuCanvasResize(getCanvasRef: () => { current: HTMLCanvasElement | null }, getContainerRef: () => { current: HTMLDivElement | null }, getAspectRatio: () => number | undefined = () => undefined, getEnabled: () => unknown = () => (true)) {
    const canvasRef = $derived(getCanvasRef())
    const containerRef = $derived(getContainerRef())
    const aspectRatio = $derived(getAspectRatio())
    const enabled = $derived(getEnabled())
    $effect(() => {
      void [aspectRatio]

      if (!enabled) return
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return

      const resizeCanvas = (width: number, height: number) => {
        if (width <= 0 || height <= 0) return
        const dpr = window.devicePixelRatio || 1
        let w = width
        let h = height
        if (aspectRatio) {
          const containedHeight = width / aspectRatio
          if (containedHeight <= height) {
            h = containedHeight
          } else {
            h = height
            w = height * aspectRatio
          }
        }
        const pw = Math.round(w * dpr)
        const ph = Math.round(h * dpr)
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw
          canvas.height = ph
          canvas.style.width = `${Math.round(w)}px`
          canvas.style.height = `${Math.round(h)}px`
        }
      }

      const ro = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        resizeCanvas(entry.contentRect.width, entry.contentRect.height)
      })
      ro.observe(container)

      resizeCanvas(container.clientWidth, container.clientHeight)
      const rafId = requestAnimationFrame(() => {
        resizeCanvas(container.clientWidth, container.clientHeight)
      })

      return () => {
        cancelAnimationFrame(rafId)
        ro.disconnect()
      }
    })
  }

  // ── Main component ──────────────────────────────────────────────────────────

  interface ColorScopesViewProps {
    open: boolean
    embedded?: boolean
    embeddedLayout?: 'grid' | 'stack'
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { select } from '$lib/store.svelte'
  import Activity from '@lucide/svelte/icons/activity'
  import { getResolvedPlaybackFrame, usePlaybackStore } from '@/shared/state/playback'
  import { usePreviewBridgeStore } from '@/shared/state/preview-bridge'
  import { cn } from '@/shared/ui/cn'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { ScopeRenderer } from '@/infrastructure/gpu-scopes'
  import { ScopeCanvasFrame } from '../color-scope-overlays'
  import ScopeModeBar from './scope-mode-bar.svelte'
  let { open, embedded = false, embeddedLayout = 'grid' }: ColorScopesViewProps = $props()
  let status = $state.raw<'idle' | 'live' | 'error'>('idle')
  const setStatus = (next: 'idle' | 'live' | 'error' | ((prev: 'idle' | 'live' | 'error') => 'idle' | 'live' | 'error')) => {
    status = typeof next === 'function' ? (next as (prev: 'idle' | 'live' | 'error') => 'idle' | 'live' | 'error')(untrack(() => status)) : next
  }
  let gpuReady = $state.raw<boolean | null>(null)
  const setGpuReady = (next: boolean | null | ((prev: boolean | null) => boolean | null)) => {
    gpuReady = typeof next === 'function' ? (next as (prev: boolean | null) => boolean | null)(untrack(() => gpuReady)) : next
  }
  // null = pending
  let waveformMode = $state.raw<ScopeViewMode>('luma')
  const setWaveformMode = (next: ScopeViewMode | ((prev: ScopeViewMode) => ScopeViewMode)) => {
    waveformMode = typeof next === 'function' ? (next as (prev: ScopeViewMode) => ScopeViewMode)(untrack(() => waveformMode)) : next
  }
  let histogramMode = $state.raw<ScopeViewMode>('rgb')
  const setHistogramMode = (next: ScopeViewMode | ((prev: ScopeViewMode) => ScopeViewMode)) => {
    histogramMode = typeof next === 'function' ? (next as (prev: ScopeViewMode) => ScopeViewMode)(untrack(() => histogramMode)) : next
  }
  let stackView = $state.raw<StackScopeView>(loadStackView())
  const setStackView = (next: StackScopeView | ((prev: StackScopeView) => StackScopeView)) => {
    stackView = typeof next === 'function' ? (next as (prev: StackScopeView) => StackScopeView)(untrack(() => stackView)) : next
  }

  const isPlaying = select(usePlaybackStore, (s) => s.isPlaying)
  const captureFrameImageData = usePreviewBridgeStore.getState().captureFrameImageData
  const captureFrame = usePreviewBridgeStore.getState().captureFrame
  const isEmbeddedStackLayout = $derived(embedded && embeddedLayout === 'stack')
  const stackShows = (scope: StackScopeView) => !isEmbeddedStackLayout || stackView === scope
  const showWaveform = $derived(stackShows('waveform'))
  const showParade = $derived(embedded && stackShows('parade'))
  const showVectorscope = $derived(stackShows('vectorscope'))
  const showHistogram = $derived(embedded && stackShows('histogram'))

  const waveformCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const paradeCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const vectorscopeCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const histogramCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const waveformContainerRef: { current: HTMLDivElement | null } = { current: null }
  const paradeContainerRef: { current: HTMLDivElement | null } = { current: null }
  const vectorscopeContainerRef: { current: HTMLDivElement | null } = { current: null }
  const histogramContainerRef: { current: HTMLDivElement | null } = { current: null }

  const rendererRef: { current: ScopeRenderer | null } = { current: null }
  const gpuCtxCacheRef = { current: new Map<HTMLCanvasElement, GpuCanvasContextCacheEntry>() }
  const gpuRenderInFlightRef = { current: false }
  const cpuDrawInFlightRef = { current: false }
  const cpuDrawPendingRef = { current: false }
  const sampleCanvasRef: { current: HTMLCanvasElement | null } = { current: null }
  const liveTickRef = { current: 0 }

  // Refs for values read inside RAF loop (avoid restarting loop on every change)
  const isPlayingRef = { current: isPlaying.current }
  $effect.pre(() => {
    isPlayingRef.current = isPlaying.current
  })
  const waveformModeRef = { current: waveformMode }
  $effect.pre(() => {
    waveformModeRef.current = waveformMode
  })
  const histogramModeRef = { current: histogramMode }
  $effect.pre(() => {
    histogramModeRef.current = histogramMode
  })

  // Persist settings
  $effect(() => {
    try {
      localStorage.setItem(STACK_LAYOUT_STORAGE_KEY, stackView)
    } catch {
      /* ignore */
    }
  })

  // DPR-aware sizing for GPU canvases. The enabled flags double as remount
  // triggers: switching the stack scope picker unmounts/remounts sections,
  // and the effect must re-observe the fresh container element.
  useGpuCanvasResize(() => waveformCanvasRef, () => waveformContainerRef, () => undefined, () => showWaveform)
  useGpuCanvasResize(() => paradeCanvasRef, () => paradeContainerRef, () => PARADE_SCOPE_ASPECT_RATIO, () => showParade)
  useGpuCanvasResize(() => histogramCanvasRef, () => histogramContainerRef, () => undefined, () => showHistogram)
  useGpuCanvasResize(() => vectorscopeCanvasRef, () => vectorscopeContainerRef, () => 1, () => showVectorscope)

  // ── GPU initialization ──────────────────────────────────────────────────
  $effect(() => {
    if (!open) return
    let cancelled = false
    const gpuCtxCache = gpuCtxCacheRef.current

    setGpuReady(null)
    rendererRef.current?.destroy()
    rendererRef.current = null
    gpuCtxCache.clear()

    ScopeRenderer.create().then((r) => {
      if (cancelled) {
        r?.destroy()
        return
      }
      if (r) {
        rendererRef.current = r
        setGpuReady(true)
      } else {
        setGpuReady(false)
      }
    })
    return () => {
      cancelled = true
      rendererRef.current?.destroy()
      rendererRef.current = null
      gpuCtxCache.clear()
    }
  })

  // ── GPU render loop ─────────────────────────────────────────────────────
  const getGpuCtx = (canvas: HTMLCanvasElement | null): GPUCanvasContext | null => {
    if (!canvas) return null
    const renderer = rendererRef.current
    if (!renderer) return null
    if (canvas.width < 2 || canvas.height < 2) return null
    const cache = gpuCtxCacheRef.current
    const cached = cache.get(canvas)
    if (cached && cached.width === canvas.width && cached.height === canvas.height) {
      return cached.ctx
    }
    // Scope switching unmounts canvases — drop their cached contexts so the
    // map doesn't pin detached elements forever.
    for (const cached of cache.keys()) {
      if (!cached.isConnected) cache.delete(cached)
    }
    const ctx = renderer.configureCanvas(canvas) ?? undefined
    if (ctx) {
      cache.set(canvas, {
        ctx,
        width: canvas.width,
        height: canvas.height,
      })
    }
    return ctx ?? null
  }

  $effect(() => {
    if (gpuReady !== true || !open) return
    const renderer = rendererRef.current
    if (!renderer) return

    let cancelled = false
    let lastTime = 0
    let inFlightSince = 0
    // Monotonic id for each render that actually goes in-flight. Lets a render's
    // `finally` clear the flag only if it still owns it — a slow (not infinite)
    // capture that resolves after the watchdog already started a newer render
    // must not reset the flag the newer render now holds.
    let renderGeneration = 0
    // Clear any flag left wedged true by a render whose `finally` never ran on a
    // prior mount — otherwise the loop would start gated and never capture.
    gpuRenderInFlightRef.current = false

    const tick = (time: number) => {
      if (cancelled) return
      // Self-heal a stuck in-flight render so a single hung capture can't
      // freeze the scopes for the rest of the session.
      if (gpuRenderInFlightRef.current && time - inFlightSince >= GPU_RENDER_STUCK_TIMEOUT_MS) {
        gpuRenderInFlightRef.current = false
      }
      if (time - lastTime >= GPU_INTERVAL && !gpuRenderInFlightRef.current) {
        lastTime = time
        void renderGpuFrame()
      }
      requestAnimationFrame(tick)
    }

    const renderGpuFrame = async () => {
      if (gpuRenderInFlightRef.current) return
      // Scrub/hover preview frames are latency-sensitive. Let the program
      // monitor own those transient frames, then scopes catch up on release.
      if (usePlaybackStore.getState().previewFrame !== null) return
      const generation = ++renderGeneration
      gpuRenderInFlightRef.current = true
      // Stamp the in-flight start only once the flag is actually set, so the
      // watchdog measures from when this render truly began (not from a tick
      // whose render bailed out at a guard above).
      inFlightSince = performance.now()
      // A render is stale once cancelled or superseded by a newer one (e.g. the
      // watchdog force-cleared this slow render and started another). Stale
      // renders must not touch the GPU — that's the overlapping-upload hazard.
      const isStale = () => cancelled || renderGeneration !== generation
      const { kr, kb } = getMatrixCoefficients(SCOPE_COLOR_MATRIX)
      renderer.setMatrix(kr, kb)
      renderer.setRange(0, 1)

      try {
        // Try near-zero-copy canvas path first
        const canvasSourceFn = usePreviewBridgeStore.getState().captureCanvasSource
        if (canvasSourceFn) {
          const source = await canvasSourceFn({
            fresh: isPlayingRef.current,
            preferRenderedFrame: true,
          })
          if (source && !isStale()) {
            renderer.uploadFromCanvas(source)
          } else if (!isStale()) {
            // No source available — try ImageData fallback
            await fallbackToImageData(renderer, isStale)
          }
        } else {
          await fallbackToImageData(renderer, isStale)
        }

        if (isStale()) return

        // Render each visible scope — hidden scopes have no mounted canvas,
        // so getGpuCtx returns null and they cost nothing.
        const wfCtx = getGpuCtx(waveformCanvasRef.current)
        const waveformRequests: Array<{ ctx: GPUCanvasContext; mode: number }> = []
        if (wfCtx) {
          waveformRequests.push({ ctx: wfCtx, mode: VIEW_MODE_NUM[waveformModeRef.current] })
        }

        const parCtx = getGpuCtx(paradeCanvasRef.current)
        if (parCtx) {
          waveformRequests.push({ ctx: parCtx, mode: 5 }) // parade mode
        }

        const histCtx = getGpuCtx(histogramCanvasRef.current)
        if (histCtx) renderer.renderHistogram(histCtx, VIEW_MODE_NUM[histogramModeRef.current])

        if (waveformRequests.length > 0) {
          renderer.renderWaveforms(waveformRequests)
        }

        const vsCtx = getGpuCtx(vectorscopeCanvasRef.current)
        if (vsCtx) renderer.renderVectorscope(vsCtx)

        setStatus('live')
      } catch {
        setStatus('error')
      } finally {
        // Only release the flag if we still own it. If the watchdog superseded
        // this render with a newer one, that render owns the flag now.
        if (renderGeneration === generation) {
          gpuRenderInFlightRef.current = false
        }
      }
    }

    const fallbackToImageData = async (r: ScopeRenderer, isStale?: () => boolean) => {
      const captureFn = usePreviewBridgeStore.getState().captureFrameImageData
      if (!captureFn) return
      const sampleW = isPlayingRef.current ? SAMPLE_WIDTH_PLAYING : SAMPLE_WIDTH_PAUSED
      const sampleH = isPlayingRef.current ? SAMPLE_HEIGHT_PLAYING : SAMPLE_HEIGHT_PAUSED
      const imageData = await captureFn({
        width: sampleW,
        height: sampleH,
        fresh: isPlayingRef.current,
        preferRenderedFrame: true,
      })
      if (imageData && !isStale?.()) r.uploadFrame(imageData)
    }

    requestAnimationFrame(tick)
    return () => {
      cancelled = true
    }
  })

  // ── CPU fallback render ─────────────────────────────────────────────────
  const cpuDraw = async (retryCount = 0) => {
      if (!open || gpuReady !== false) return
      if (!captureFrameImageData && !captureFrame) return

      const getRequestedFrame = () => {
        const playbackState = usePlaybackStore.getState()
        return getResolvedPlaybackFrame({
          currentFrame: playbackState.currentFrame,
          currentFrameEpoch: playbackState.currentFrameEpoch,
          previewFrame: playbackState.previewFrame,
          previewFrameEpoch: playbackState.previewFrameEpoch,
          isPlaying: playbackState.isPlaying,
          displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
        })
      }
      const requestedFrame = getRequestedFrame()

      // Hidden scopes have no mounted canvas — draw whichever are present.
      const wfCanvas = waveformCanvasRef.current
      const vsCanvas = vectorscopeCanvasRef.current
      if (!wfCanvas && !vsCanvas && !paradeCanvasRef.current && !histogramCanvasRef.current) {
        return
      }

      const wfSize = wfCanvas ? ensureCanvasSize(wfCanvas, 512, 256, 1920, 1080) : null
      const parSize = paradeCanvasRef.current
        ? ensureCanvasSize(paradeCanvasRef.current, 512, 256, 1920, 1080)
        : null
      const histSize = histogramCanvasRef.current
        ? ensureCanvasSize(histogramCanvasRef.current, 512, 256, 1920, 1080)
        : null
      let vsSize = 0
      if (vsCanvas) {
        const vsRect = ensureCanvasSize(vsCanvas, 256, 256, 1024, 1024)
        vsSize = Math.max(2, Math.min(vsRect.width, vsRect.height))
        if (vsCanvas.width !== vsSize || vsCanvas.height !== vsSize) {
          vsCanvas.width = vsSize
          vsCanvas.height = vsSize
        }
      }

      const wfCtx = wfCanvas?.getContext('2d') ?? null
      const parCtx = paradeCanvasRef.current?.getContext('2d') ?? null
      const vsCtx = vsCanvas?.getContext('2d') ?? null
      const histCtx = histogramCanvasRef.current?.getContext('2d') ?? null

      try {
        const sampleW = isPlaying.current ? SAMPLE_WIDTH_PLAYING : SAMPLE_WIDTH_PAUSED
        const sampleH = isPlaying.current ? SAMPLE_HEIGHT_PLAYING : SAMPLE_HEIGHT_PAUSED
        let imageData: ImageData | null = null

        if (captureFrameImageData) {
          imageData = await captureFrameImageData({
            width: sampleW,
            height: sampleH,
            fresh: isPlaying.current,
            preferRenderedFrame: true,
          })
        }

        if (!imageData && captureFrame) {
          const dataUrl = await captureFrame({
            width: sampleW,
            height: sampleH,
            format: 'image/jpeg',
            quality: isPlaying.current ? 0.72 : 0.85,
            fresh: isPlaying.current,
            preferRenderedFrame: true,
          })
          if (dataUrl) {
            const img = new Image()
            img.src = dataUrl
            await img.decode()
            let sc = sampleCanvasRef.current
            if (!sc) {
              sc = document.createElement('canvas')
              sampleCanvasRef.current = sc
            }
            if (sc.width !== sampleW || sc.height !== sampleH) {
              sc.width = sampleW
              sc.height = sampleH
            }
            const sctx = sc.getContext('2d', { willReadFrequently: true })
            if (!sctx) return
            sctx.clearRect(0, 0, sampleW, sampleH)
            sctx.drawImage(img, 0, 0, sampleW, sampleH)
            imageData = sctx.getImageData(0, 0, sampleW, sampleH)
          }
        }

        if (!imageData) {
          setStatus('idle')
          return
        }
        if (getRequestedFrame() !== requestedFrame) {
          if (retryCount < 1) await cpuDraw(retryCount + 1)
          return
        }

        if (wfCtx && wfSize) {
          cpuDrawWaveform(
            imageData,
            wfCtx,
            SCOPE_COLOR_MATRIX,
            SCOPE_RANGE_MODE,
            wfSize.width,
            wfSize.height,
          )
        }
        const drawHeavy = !isPlaying.current || liveTickRef.current % 2 === 0
        liveTickRef.current += 1
        if (parCtx && parSize && drawHeavy) {
          cpuDrawParade(imageData, parCtx, SCOPE_RANGE_MODE, parSize.width, parSize.height)
        }
        if (vsCtx && vsSize > 0) {
          cpuDrawVectorscope(imageData, vsCtx, SCOPE_COLOR_MATRIX, vsSize)
        }
        if (histCtx && histSize && drawHeavy) {
          cpuDrawHistogram(
            imageData,
            histCtx,
            SCOPE_COLOR_MATRIX,
            SCOPE_RANGE_MODE,
            histSize.width,
            histSize.height,
          )
        }
        setStatus('live')
      } catch {
        setStatus('error')
      }
    }

  const runSerializedCpuDraw = async () => {
    if (cpuDrawInFlightRef.current) {
      cpuDrawPendingRef.current = true
      return
    }

    cpuDrawInFlightRef.current = true
    try {
      do {
        cpuDrawPendingRef.current = false
        await cpuDraw()
      } while (cpuDrawPendingRef.current)
    } finally {
      cpuDrawInFlightRef.current = false
    }
  }

  // CPU: freshly mounted scope canvases are blank until the next frame
  // change — paint them as soon as the picker swaps the visible scope.
  $effect(() => {
    void [showWaveform, showParade, showVectorscope, showHistogram]

    if (gpuReady !== false || !open) return
    void runSerializedCpuDraw()
  })

  // CPU: update on frame change when paused
  $effect(() => {
    if (gpuReady !== false || !open || isPlaying.current) return

    let rafId: number | null = null
    const scheduleDraw = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        void runSerializedCpuDraw()
      })
    }

    scheduleDraw()

    const scheduleIfFrameChanged = (nextRequestedFrame: number, previousRequestedFrame: number) => {
      if (nextRequestedFrame !== previousRequestedFrame) {
        scheduleDraw()
      }
    }

    const unsubscribePlayback = usePlaybackStore.subscribe((state, previousState) => {
      if (state.isPlaying) {
        return
      }
      if (state.previewFrame !== null) {
        return
      }
      if (previousState.previewFrame !== null) {
        scheduleDraw()
        return
      }

      const nextRequestedFrame = getResolvedPlaybackFrame({
        currentFrame: state.currentFrame,
        currentFrameEpoch: state.currentFrameEpoch,
        previewFrame: state.previewFrame,
        previewFrameEpoch: state.previewFrameEpoch,
        isPlaying: state.isPlaying,
        displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
      })
      const previousRequestedFrame = getResolvedPlaybackFrame({
        currentFrame: previousState.currentFrame,
        currentFrameEpoch: previousState.currentFrameEpoch,
        previewFrame: previousState.previewFrame,
        previewFrameEpoch: previousState.previewFrameEpoch,
        isPlaying: previousState.isPlaying,
        displayedFrame: usePreviewBridgeStore.getState().displayedFrame,
      })

      scheduleIfFrameChanged(nextRequestedFrame, previousRequestedFrame)
    })

    const unsubscribePreviewBridge = usePreviewBridgeStore.subscribe(
      (bridgeState, previousBridgeState) => {
        const playbackState = usePlaybackStore.getState()
        if (playbackState.isPlaying || playbackState.previewFrame !== null) {
          return
        }

        const nextRequestedFrame = getResolvedPlaybackFrame({
          currentFrame: playbackState.currentFrame,
          currentFrameEpoch: playbackState.currentFrameEpoch,
          previewFrame: playbackState.previewFrame,
          previewFrameEpoch: playbackState.previewFrameEpoch,
          isPlaying: playbackState.isPlaying,
          displayedFrame: bridgeState.displayedFrame,
        })
        const previousRequestedFrame = getResolvedPlaybackFrame({
          currentFrame: playbackState.currentFrame,
          currentFrameEpoch: playbackState.currentFrameEpoch,
          previewFrame: playbackState.previewFrame,
          previewFrameEpoch: playbackState.previewFrameEpoch,
          isPlaying: playbackState.isPlaying,
          displayedFrame: previousBridgeState.displayedFrame,
        })

        scheduleIfFrameChanged(nextRequestedFrame, previousRequestedFrame)
      },
    )

    return () => {
      unsubscribePlayback()
      unsubscribePreviewBridge()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      cpuDrawPendingRef.current = false
    }
  })

  // CPU: polling loop during playback
  $effect(() => {
    if (gpuReady !== false || !open || !isPlaying.current) return
    let cancelled = false
    void (async () => {
      while (!cancelled) {
        await runSerializedCpuDraw()
        await new Promise((r) => setTimeout(r, CPU_INTERVAL))
      }
    })()
    return () => {
      cancelled = true
    }
  })
</script>

{#if open}
  <div
    class={cn(
      embedded
        ? 'h-full rounded-md border border-border bg-background p-2'
        : 'absolute bottom-3 right-3 z-20 rounded-md border border-border bg-background/95 backdrop-blur-sm shadow-lg p-2 pointer-events-none',
    )}
  >
    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <div class="text-[10px] uppercase tracking-wide text-muted-foreground">
          Scopes
        </div>
        {#if isEmbeddedStackLayout}
          <Select
            value={stackView}
            onValueChange={(value) => setStackView(value as StackScopeView)}
          >
            <SelectTrigger
              aria-label="Scope"
              class="h-5 w-[104px] gap-1 rounded border-border/70 px-1.5 py-0 text-[10px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {#each STACK_SCOPE_VIEWS as view (view.value)}
                <SelectItem value={view.value} class="text-xs">
                  {view.label}
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
        {/if}
      </div>
      <div class="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Activity
          class={`w-3 h-3 ${status === 'live' ? 'text-emerald-500' : status === 'error' ? 'text-red-500' : ''}`}
         />
        {#if status === 'live'}
          {#if gpuReady}
            gpu
          {:else}
            cpu
          {/if}
        {:else if status === 'error'}
          err
        {:else}
          idle
        {/if}
      </div>
    </div>
    {#if embedded}
      {#if embeddedLayout === 'stack'}
        <div class="h-[calc(100%-22px)] min-h-0 flex flex-col gap-2">
          {#if showWaveform}
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="mb-1 flex items-center justify-between">
                <div class="text-[10px] text-muted-foreground">
                  Waveform
                </div>
                {#if gpuReady}
                  <ScopeModeBar mode={waveformMode} onChange={setWaveformMode} />
                {/if}
              </div>
              <ScopeCanvasFrame
                containerRef={waveformContainerRef}
                kind="waveform"
                class="min-h-0 flex-1"
              >
                <canvas bind:this={waveformCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
          {/if}
          {#if showParade}
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="text-[10px] mb-1 text-muted-foreground">
                RGB Parade
              </div>
              <ScopeCanvasFrame
                containerRef={paradeContainerRef}
                kind="parade"
                class="min-h-0 w-full aspect-[10/3]"
              >
                <canvas bind:this={paradeCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
          {/if}
          {#if showVectorscope}
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
              <div class="text-[10px] mb-1 text-muted-foreground">
                Vectorscope
              </div>
              <ScopeCanvasFrame
                containerRef={vectorscopeContainerRef}
                kind="vectorscope"
                class="mx-auto flex min-h-0 min-w-0 w-full max-w-[420px] flex-1 items-center justify-center"
              >
                <canvas
                  bind:this={vectorscopeCanvasRef.current}
                  class="max-w-full max-h-full aspect-square"
                ></canvas>
              </ScopeCanvasFrame>
            </div>
          {/if}
          {#if showHistogram}
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="mb-1 flex items-center justify-between">
                <div class="text-[10px] text-muted-foreground">
                  Histogram
                </div>
                {#if gpuReady}
                  <ScopeModeBar mode={histogramMode} onChange={setHistogramMode} />
                {/if}
              </div>
              <ScopeCanvasFrame
                containerRef={histogramContainerRef}
                kind="histogram"
                class="min-h-0 flex-1"
              >
                <canvas bind:this={histogramCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
          {/if}
        </div>
      {:else}
        <div class="h-[calc(100%-22px)] min-h-0 flex gap-3">
          <div class="min-w-0 flex-1 grid grid-cols-2 gap-3 auto-rows-fr">
            <div class="flex min-h-0 flex-col">
              <div class="flex items-center justify-between mb-1">
                <div class="text-[10px] text-muted-foreground">
                  Waveform
                </div>
                {#if gpuReady}
                  <ScopeModeBar mode={waveformMode} onChange={setWaveformMode} />
                {/if}
              </div>
              <ScopeCanvasFrame
                containerRef={waveformContainerRef}
                kind="waveform"
                class="flex-1 min-h-[160px]"
              >
                <canvas bind:this={waveformCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
            <div class="flex min-h-0 flex-col">
              <div class="text-[10px] mb-1 text-muted-foreground">
                RGB Parade
              </div>
              <ScopeCanvasFrame
                containerRef={paradeContainerRef}
                kind="parade"
                class="w-full aspect-[10/3]"
              >
                <canvas bind:this={paradeCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
            <div class="col-span-2 flex min-h-0 flex-col">
              <div class="flex items-center justify-between mb-1">
                <div class="text-[10px] text-muted-foreground">
                  Histogram
                </div>
                {#if gpuReady}
                  <ScopeModeBar mode={histogramMode} onChange={setHistogramMode} />
                {/if}
              </div>
              <ScopeCanvasFrame
                containerRef={histogramContainerRef}
                kind="histogram"
                class="flex-1 min-h-[160px]"
              >
                <canvas bind:this={histogramCanvasRef.current} class="w-full h-full"></canvas>
              </ScopeCanvasFrame>
            </div>
          </div>
          <div class="basis-[32%] min-w-[220px] max-w-[380px] flex min-h-0 flex-col">
            <div class="text-[10px] mb-1 text-muted-foreground">
              Vectorscope
            </div>
            <ScopeCanvasFrame
              containerRef={vectorscopeContainerRef}
              kind="vectorscope"
              class="flex flex-1 min-h-0 items-center justify-center"
            >
              <canvas
                bind:this={vectorscopeCanvasRef.current}
                class="max-w-full max-h-full aspect-square"
              ></canvas>
            </ScopeCanvasFrame>
          </div>
        </div>
      {/if}
    {:else}
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex items-center justify-between mb-1">
            <div class="text-[10px] text-muted-foreground">
              Waveform
            </div>
            {#if gpuReady}
              <ScopeModeBar mode={waveformMode} onChange={setWaveformMode} />
            {/if}
          </div>
          <ScopeCanvasFrame
            containerRef={waveformContainerRef}
            kind="waveform"
            class="w-[220px] h-[110px]"
          >
            <canvas bind:this={waveformCanvasRef.current} class="w-full h-full"></canvas>
          </ScopeCanvasFrame>
        </div>
        <div>
          <div class="text-[10px] mb-1 text-muted-foreground">
            Vectorscope
          </div>
          <ScopeCanvasFrame
            containerRef={vectorscopeContainerRef}
            kind="vectorscope"
            class="w-[160px] h-[160px]"
          >
            <canvas bind:this={vectorscopeCanvasRef.current} class="w-full h-full"></canvas>
          </ScopeCanvasFrame>
        </div>
      </div>
    {/if}
  </div>
{/if}
