<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { applyEasingConfig } from '@/shared/utils/easing'
  import type { BezierControlPoints, EasingConfig, SpringParameters } from '@/types/keyframe'

  /**
   * The easing editor, adapted from easings.dev: a curve canvas on the left, and
   * parameter slider+number rows plus a `Duration` row and a moving-dot Position
   * Preview on the right. For a cubic-bezier easing the rows are `x1 / y1 / x2 /
   * y2`; for a spring they are `tension / friction / mass`. Both the canvas and
   * the preview evaluate the real `EasingConfig`, so a spring shows its actual
   * bounce (not the linear diagonal a spring collapses to as a bezier).
   *
   * `Duration` drives only the preview playback (it is not stored on the keyframe
   * — a segment's real duration is the gap between its two keyframes).
   */

  type BezierKey = keyof BezierControlPoints

  const BEZIER_INPUT_KEYS = ['x1', 'y1', 'x2', 'y2'] as const
  const SPRING_INPUT_KEYS = ['tension', 'friction', 'mass'] as const
  type SpringKey = (typeof SPRING_INPUT_KEYS)[number]

  // Spring params are user-facing words (unlike the bezier x1/y1 math notation),
  // so they're translated. Fallbacks keep the labels working before locales load.
  const SPRING_LABEL: Record<SpringKey, { key: string; fallback: string }> = {
    tension: { key: 'timeline.keyframeEditor.springTension', fallback: 'Tension' },
    friction: { key: 'timeline.keyframeEditor.springFriction', fallback: 'Friction' },
    mass: { key: 'timeline.keyframeEditor.springMass', fallback: 'Mass' },
  }

  // Canvas geometry (px). Vertical headroom shows overshoot/anticipation.
  const SIZE = 176
  const PAD = 16
  const PLOT = SIZE - PAD * 2
  const Y_MIN = -0.7
  const Y_MAX = 1.7

  const xToPx = (x: number) => PAD + x * PLOT
  const yToPx = (y: number) => PAD + ((Y_MAX - y) / (Y_MAX - Y_MIN)) * PLOT

  const FIELD_RANGE: Record<BezierKey, { min: number; max: number }> = {
    x1: { min: 0, max: 1 },
    y1: { min: -1, max: 2 },
    x2: { min: 0, max: 1 },
    y2: { min: -1, max: 2 },
  }

  // Ranges wide enough for every catalog spring (e.g. tension up to 1000, mass up
  // to 10). Clamps live here so the editor stays self-contained, mirroring the
  // bezier `FIELD_RANGE` above. `decimals` keeps the readout faithful to fractional
  // preset values (e.g. Bob's friction 2.3) rather than rounding them away.
  const SPRING_FIELD_RANGE: Record<
    SpringKey,
    { min: number; max: number; step: number; decimals: number }
  > = {
    tension: { min: 1, max: 1000, step: 1, decimals: 1 },
    friction: { min: 1, max: 100, step: 1, decimals: 1 },
    mass: { min: 0.1, max: 10, step: 0.1, decimals: 2 },
  }

  function clampField(key: BezierKey, value: number): number {
    const { min, max } = FIELD_RANGE[key]
    return Math.max(min, Math.min(max, value))
  }

  function clampSpringField(key: SpringKey, value: number): number {
    const { min, max } = SPRING_FIELD_RANGE[key]
    return Math.max(min, Math.min(max, value))
  }

  // Preview playback duration for a spring, derived from its physics like
  // easing.dev (which exposes no duration control). The oscillator's decay
  // envelope e^(-(c/2m)t) settles to ~1% at t = ln(100)·2m/c, so it depends only
  // on mass + friction (damping), not tension — a stiffer spring oscillates
  // faster but its settle envelope is unchanged. Matches easing.dev's computed
  // transition-duration (mass 0.3 / friction 18 → 153ms; mass 4 / friction 80 → 460ms).
  const BEZIER_PREVIEW_DURATION = 1
  function springPreviewDuration({ mass, friction }: SpringParameters): number {
    const decay = friction / (2 * mass)
    const seconds = decay > 0 ? Math.log(100) / decay : BEZIER_PREVIEW_DURATION
    return Math.max(0.15, Math.min(4, seconds))
  }

  function curvePath(config: EasingConfig): string {
    // For a cubic-bezier, trace the true parametric control-point curve so the
    // handles' shape reads correctly. Everything else (springs) has no bezier
    // form — sample the eased value against uniform time instead.
    if (config.type === 'cubic-bezier' && config.bezier) {
      const { x1, y1, x2, y2 } = config.bezier
      const steps = 48
      let d = `M ${xToPx(0)} ${yToPx(0)}`
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t
        const y = 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t
        d += ` L ${xToPx(x)} ${yToPx(y)}`
      }
      return d
    }

    const steps = 64
    let d = `M ${xToPx(0)} ${yToPx(applyEasingConfig(0, config))}`
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      d += ` L ${xToPx(t)} ${yToPx(applyEasingConfig(t, config))}`
    }
    return d
  }

  const GRID_DOTS: Array<{ key: string; cx: number; cy: number }> = []
  for (let gx = 0; gx <= 8; gx++) {
    for (let gy = 0; gy <= 8; gy++) {
      const cx = PAD + (gx / 8) * PLOT
      const cy = PAD + (gy / 8) * PLOT
      GRID_DOTS.push({ key: `${cx},${cy}`, cx, cy })
    }
  }

  // The preview drives one normalized value (0→1, with overshoot) through the
  // easing; each mode just maps it to a different property so the curve can be
  // felt the way it will be used (travel / grow / fade).
  type PreviewMode = 'position' | 'scale' | 'rotate' | 'opacity'
  const PREVIEW_MODES: Array<{ mode: PreviewMode; labelKey: string; defaultValue: string }> = [
    {
      mode: 'position',
      labelKey: 'timeline.keyframeEditor.previewPosition',
      defaultValue: 'Position',
    },
    { mode: 'scale', labelKey: 'timeline.keyframeEditor.previewScale', defaultValue: 'Scale' },
    { mode: 'rotate', labelKey: 'timeline.keyframeEditor.previewRotate', defaultValue: 'Rotate' },
    {
      mode: 'opacity',
      labelKey: 'timeline.keyframeEditor.previewOpacity',
      defaultValue: 'Opacity',
    },
  ]

  interface SliderRowSpec {
    key: string
    label: string
    value: number
    min: number
    max: number
    step: number
    decimals?: number
    onLive: (value: number) => void
    onCommit: (value: number) => void
    onDragStart?: () => void
    onDragEnd?: () => void
  }
</script>

<script lang="ts">
  import type { EasingType } from '@/types/keyframe'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import { t } from '$lib/i18n.svelte'

  import { Input } from '@/components/ui/input'
  import { Slider } from '@/components/ui/slider'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { DEFAULT_SPRING_PARAMS } from '@/types/keyframe'

  import { effectiveBezier } from './easings-dev-presets'

  interface EasingCurveEditorProps {
    /** The segment's easing type (drives whether bezier or spring rows show). */
    easing: EasingType
    /** The segment's easing config (spring params / bezier points). */
    config: EasingConfig | undefined
    /** `commit` is false for live slider drag, true for discrete edits. */
    onChangeBezier: (bezier: BezierControlPoints, commit: boolean) => void
    /** `commit` is false for live slider drag, true for discrete edits. */
    onChangeSpring: (spring: SpringParameters, commit: boolean) => void
    onDragStart?: () => void
    onDragEnd?: () => void
  }

  let { easing, config, onChangeBezier, onChangeSpring, onDragStart, onDragEnd }: EasingCurveEditorProps =
    $props()

  let duration = $state(BEZIER_PREVIEW_DURATION)

  const isSpring = $derived(easing === 'spring')
  const bezier = $derived(effectiveBezier(easing, config))
  const spring = $derived(
    config?.type === 'spring' && config.spring ? config.spring : DEFAULT_SPRING_PARAMS,
  )
  const previewConfig = $derived<EasingConfig>(
    isSpring ? { type: 'spring', spring } : { type: 'cubic-bezier', bezier },
  )
  // Two UIs, like easing.dev: springs preview at their derived settling time
  // (no control); bezier easings get a manual Duration slider.
  const previewDuration = $derived(isSpring ? springPreviewDuration(spring) : duration)

  function setBezierField(key: BezierKey, raw: number, commit: boolean) {
    onChangeBezier({ ...bezier, [key]: clampField(key, raw) }, commit)
  }

  function setSpringField(key: SpringKey, raw: number, commit: boolean) {
    onChangeSpring({ ...spring, [key]: clampSpringField(key, raw) }, commit)
  }

  // Drag a bezier control point (P1 from the start, P2 from the end) on the
  // canvas; clamps match the slider ranges (x∈[0,1], y∈[-1,2]).
  function setBezierPoint(point: 'p1' | 'p2', x: number, y: number, commit: boolean) {
    const next =
      point === 'p1'
        ? { ...bezier, x1: clampField('x1', x), y1: clampField('y1', y) }
        : { ...bezier, x2: clampField('x2', x), y2: clampField('y2', y) }
    onChangeBezier(next, commit)
  }

  const sliderRows = $derived<SliderRowSpec[]>([
    ...(isSpring
      ? SPRING_INPUT_KEYS.map((key) => ({
          key,
          label: t(SPRING_LABEL[key].key, { defaultValue: SPRING_LABEL[key].fallback }),
          value: spring[key],
          min: SPRING_FIELD_RANGE[key].min,
          max: SPRING_FIELD_RANGE[key].max,
          step: SPRING_FIELD_RANGE[key].step,
          decimals: SPRING_FIELD_RANGE[key].decimals,
          onLive: (v: number) => setSpringField(key, v, false),
          onCommit: (v: number) => setSpringField(key, v, true),
          onDragStart,
          onDragEnd,
        }))
      : BEZIER_INPUT_KEYS.map((key) => ({
          key,
          label: key,
          value: bezier[key],
          min: FIELD_RANGE[key].min,
          max: FIELD_RANGE[key].max,
          step: 0.01,
          onLive: (v: number) => setBezierField(key, v, false),
          onCommit: (v: number) => setBezierField(key, v, true),
          onDragStart,
          onDragEnd,
        }))),
    // Bezier-only manual Duration (springs derive it) — easing.dev range.
    ...(isSpring
      ? []
      : [
          {
            key: 'duration',
            label: t('timeline.keyframeEditor.duration', { defaultValue: 'Duration' }),
            value: duration,
            min: 0.1,
            max: 2,
            step: 0.05,
            decimals: 2,
            onLive: (v: number) => (duration = v),
            onCommit: (v: number) => (duration = v),
          },
        ]),
  ])

  // Per-row slider state. A row's draft resets whenever the row set switches
  // between spring and bezier, as remounting the rows did.
  let drafts = $state<Record<string, string | null>>({})
  // True only between a slider pointerdown and its release, so keyboard-driven
  // changes (which have no drag lifecycle) can be committed discretely instead.
  const pointerDragging: Record<string, boolean> = {}
  $effect.pre(() => {
    void isSpring
    drafts = {}
  })

  function commitDraft(row: SliderRowSpec) {
    const draft = drafts[row.key] ?? null
    if (draft === null) return
    const parsed = Number(draft)
    drafts[row.key] = null
    if (Number.isFinite(parsed)) row.onCommit(parsed)
  }

  // Curve canvas: which bezier handle is held.
  let svg: SVGSVGElement | null = null
  let drag = $state<'p1' | 'p2' | null>(null)
  const editableBezier = $derived(isSpring ? undefined : bezier)
  const handles = $derived(
    editableBezier
      ? ([
          { key: 'p1' as const, hx: editableBezier.x1, hy: editableBezier.y1, ax: 0, ay: 0 },
          { key: 'p2' as const, hx: editableBezier.x2, hy: editableBezier.y2, ax: 1, ay: 1 },
        ] as const)
      : [],
  )

  // While a handle is held, track the pointer on the window (not just the SVG)
  // so the drag survives leaving the canvas; convert client px → bezier coords.
  $effect(() => {
    const point = drag
    if (!point || isSpring) return
    const toBezier = (clientX: number, clientY: number) => {
      const rect = svg?.getBoundingClientRect()
      if (!rect) return null
      const vx = ((clientX - rect.left) / rect.width) * SIZE
      const vy = ((clientY - rect.top) / rect.height) * SIZE
      return { x: (vx - PAD) / PLOT, y: Y_MAX - ((vy - PAD) / PLOT) * (Y_MAX - Y_MIN) }
    }
    const move = (e: PointerEvent) => {
      const b = toBezier(e.clientX, e.clientY)
      if (b) setBezierPoint(point, b.x, b.y, false)
    }
    const up = (e: PointerEvent) => {
      const b = toBezier(e.clientX, e.clientY)
      if (b) setBezierPoint(point, b.x, b.y, true)
      drag = null
      onDragEnd?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    // Treat cancellation (e.g. touch interruption) like release so the drag
    // state clears and onDragEnd always fires exactly once.
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })

  function startDrag(point: 'p1' | 'p2', e: PointerEvent) {
    e.preventDefault()
    onDragStart?.()
    drag = point
  }

  // Position preview.
  let playing = $state(true)
  let mode = $state<PreviewMode>('position')
  let pos = $state(0)

  $effect(() => {
    if (!playing) return
    let raf = 0
    const start = performance.now()
    // Mirror ping-pong, matching easing.dev: the dot eases out (overshooting the
    // far end), then eases *back* — the return leg is the easing flipped in both
    // time and value (`1 - ease(p)`), so a spring overshoots past the start too.
    // No explicit end-hold: a spring's own flat settle tail provides the dwell,
    // and mirroring keeps velocity continuous through the turnaround (an added
    // freeze reads as a stall). A plain forward-then-teleport loop looks janky.
    const tick = (now: number) => {
      const dur = Math.max(0.05, previewDuration)
      const cfg = previewConfig
      const phase = ((now - start) / 1000) % (2 * dur)
      pos =
        phase < dur
          ? applyEasingConfig(phase / dur, cfg) // ease out
          : 1 - applyEasingConfig((phase - dur) / dur, cfg) // ease back (mirror)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  })

  const activeName = $derived.by(() => {
    const active = PREVIEW_MODES.find((m) => m.mode === mode)
    return active ? t(active.labelKey, { defaultValue: active.defaultValue }) : ''
  })
</script>

{#snippet sliderRow(row: SliderRowSpec)}
  <label class="flex items-center gap-2 text-[11px] text-muted-foreground">
    <span class="w-14 shrink-0">{row.label}</span>
    <Slider
      value={[row.value]}
      min={row.min}
      max={row.max}
      step={row.step}
      onpointerdown={() => {
        pointerDragging[row.key] = true
        row.onDragStart?.()
      }}
      onValueChange={(values) => {
        const next = values[0] ?? row.value
        // Pointer drags stream live (committed on release); keyboard/other
        // discrete changes have no drag lifecycle, so commit immediately.
        if (pointerDragging[row.key]) row.onLive(next)
        else row.onCommit(next)
      }}
      onValueCommit={() => {
        if (pointerDragging[row.key]) {
          pointerDragging[row.key] = false
          row.onDragEnd?.()
        }
      }}
      class="min-w-0 flex-1"
      aria-label={row.label}
    />
    <Input
      autocomplete="off"
      data-bwignore="true"
      value={drafts[row.key] ?? row.value.toFixed(row.decimals ?? 2)}
      oninput={(event) => (drafts[row.key] = event.currentTarget.value)}
      onblur={() => commitDraft(row)}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commitDraft(row)
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          drafts[row.key] = null
          event.currentTarget.blur()
        }
      }}
      class="h-6 w-14 shrink-0 px-1.5 text-center text-[11px] tabular-nums"
      inputmode="decimal"
    />
  </label>
{/snippet}

<div class="flex items-stretch gap-3">
  <!-- Square canvas, capped so the sliders keep a usable width; centered
       vertically against the taller controls column. -->
  <div class="aspect-square w-[190px] shrink-0 self-center">
    <svg
      bind:this={svg}
      viewBox="0 0 {SIZE} {SIZE}"
      class="block h-full w-full touch-none rounded-md border border-border/60 bg-black/40"
      aria-hidden="true"
    >
      {#each GRID_DOTS as dot (dot.key)}
        <circle cx={dot.cx} cy={dot.cy} r={0.7} class="fill-white/15" />
      {/each}
      <line
        x1={xToPx(0)}
        y1={yToPx(0)}
        x2={xToPx(1)}
        y2={yToPx(1)}
        class="stroke-white/10"
        stroke-width={1}
      />
      <path d={curvePath(previewConfig)} class="fill-none stroke-white" stroke-width={2} pointer-events="none" />
      <!-- Draggable cubic-bezier control handles + tangent lines (bezier only). -->
      {#each handles as h (`t-${h.key}`)}
        <line
          x1={xToPx(h.ax)}
          y1={yToPx(h.ay)}
          x2={xToPx(h.hx)}
          y2={yToPx(h.hy)}
          class="stroke-blue-500"
          stroke-width={1}
          pointer-events="none"
        />
      {/each}
      <circle cx={xToPx(0)} cy={yToPx(0)} r={2.5} class="fill-white/70" pointer-events="none" />
      <circle cx={xToPx(1)} cy={yToPx(1)} r={2.5} class="fill-white/70" pointer-events="none" />
      {#each handles as h (`h-${h.key}`)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <g class="cursor-grab" onpointerdown={(event) => startDrag(h.key, event)}>
          <!-- Larger transparent hit target for easier grabbing. -->
          <circle cx={xToPx(h.hx)} cy={yToPx(h.hy)} r={9} fill="transparent" />
          <circle cx={xToPx(h.hx)} cy={yToPx(h.hy)} r={drag === h.key ? 5 : 4} class="fill-blue-500" />
        </g>
      {/each}
    </svg>
  </div>

  <div class="flex min-w-0 flex-1 flex-col gap-1.5">
    {#each sliderRows as row (row.key)}
      {@render sliderRow(row)}
    {/each}
    <div class="mt-1 flex flex-col gap-1">
      <div class="flex items-center justify-between text-[10px] text-muted-foreground">
        <DropdownMenu>
          <DropdownMenuTrigger class="flex items-center gap-0.5 rounded hover:text-foreground">
            {activeName}
            {t('timeline.keyframeEditor.preview', { defaultValue: 'Preview' })}
            <ChevronDown class="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="min-w-[7rem]">
            {#each PREVIEW_MODES as m (m.mode)}
              <DropdownMenuItem onSelect={() => (mode = m.mode)}>
                {t(m.labelKey, { defaultValue: m.defaultValue })}
              </DropdownMenuItem>
            {/each}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" class="rounded px-1 hover:text-foreground" onclick={() => (playing = !playing)}>
          {playing
            ? t('timeline.keyframeEditor.pause', { defaultValue: 'Pause' })
            : t('timeline.keyframeEditor.play', { defaultValue: 'Play' })}
        </button>
      </div>
      <div
        class="relative flex h-20 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-black/40"
      >
        {#if mode === 'position'}
          <div class="absolute inset-x-3 top-1/2 border-t border-dashed border-white/20"></div>
          <!-- pos 0→1 spans the full dashed track (dot center hits each end);
               clamp keeps small spring overshoot inside the box instead of clipping. -->
          <div
            class="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-primary"
            style:left="clamp(0px, calc(12px + (100% - 24px) * {pos} - 7px), calc(100% - 14px))"
          ></div>
        {:else if mode === 'rotate'}
          <!-- Rounded square + orientation pip so the spin is actually visible. -->
          <div class="relative size-9 rounded-[5px] bg-primary" style:transform="rotate({pos * 180}deg)">
            <span class="absolute left-1/2 top-1 size-1.5 -translate-x-1/2 rounded-full bg-black/40"></span>
          </div>
        {:else if mode === 'scale'}
          <div class="size-9 rounded-full bg-primary" style:transform="scale({Math.max(0, pos)})"></div>
        {:else}
          <div class="size-9 rounded-full bg-primary" style:opacity={Math.max(0, Math.min(1, pos))}></div>
        {/if}
      </div>
    </div>
  </div>
</div>
