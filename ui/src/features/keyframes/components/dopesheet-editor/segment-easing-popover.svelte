<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { applyEasingConfig } from '@/shared/utils/easing'
  import { presetToEasing, type EasingDirection, type EasingPreset } from './easings-dev-presets'

  type PresetType = 'Easing' | 'Spring'
  type DirectionFilter = 'all' | EasingDirection

  const DIRECTION_FILTERS: Array<{ value: DirectionFilter; labelKey: string; defaultValue: string }> =
    [
      { value: 'all', labelKey: 'timeline.keyframeEditor.filterAll', defaultValue: 'All' },
      { value: 'in', labelKey: 'timeline.keyframeEditor.filterIn', defaultValue: 'In' },
      { value: 'out', labelKey: 'timeline.keyframeEditor.filterOut', defaultValue: 'Out' },
      { value: 'inout', labelKey: 'timeline.keyframeEditor.filterInOut', defaultValue: 'In-Out' },
    ]

  const PRESET_TYPES = ['Easing', 'Spring'] as const

  // Both views share one width so switching between them animates height only —
  // a pure vertical morph. Changing width too would move the panel's edges
  // horizontally at the same time, which reads as a diagonal resize.
  const PANEL_WIDTH = 480

  // The panel's height spring (motion's `{ type: 'spring', stiffness: 460,
  // damping: 38, mass: 0.8 }`) and the views' 120ms cross-fade.
  const HEIGHT_SPRING = { stiffness: 460, damping: 38, mass: 0.8 }
  const VIEW_FADE_MS = 120

  // Thumbnail geometry — square tile. Y range shows anticipation (<0) and
  // overshoot (>1). Path coords are in px so the SVG curve and the marker's CSS
  // motion path (offset-path) share one coordinate space.
  const T_SIZE = 44
  const T_PAD = 7
  const T_YMIN = -0.3
  const T_YMAX = 1.3

  const projX = (t: number) => T_PAD + t * (T_SIZE - T_PAD * 2)
  const projY = (v: number) => T_PAD + ((T_YMAX - v) / (T_YMAX - T_YMIN)) * (T_SIZE - T_PAD * 2)

  function presetThumbPath(preset: EasingPreset): string {
    const { easingConfig } = presetToEasing(preset)
    const steps = 24
    let d = ''
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const v = applyEasingConfig(t, easingConfig)
      d += `${i === 0 ? 'M' : 'L'} ${projX(t).toFixed(1)} ${projY(v).toFixed(1)} `
    }
    return d
  }

  // A step: flat, then a vertical jump at the end.
  const HOLD_THUMB_PATH = `M ${T_PAD} ${projY(0)} L ${T_SIZE - T_PAD} ${projY(0)} L ${T_SIZE - T_PAD} ${projY(1)}`

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  }

  /** Fades a view; the exiting one leaves the flow (motion's `popLayout`). */
  function viewFade(node: HTMLElement, { duration, exit }: { duration: number; exit?: boolean }) {
    if (exit) {
      node.style.position = 'absolute'
      node.style.top = '0'
      node.style.left = '0'
    }
    return { duration, css: (t: number) => `opacity: ${t}` }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import Plus from 'lucide-svelte/icons/plus'
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw'
  import Save from 'lucide-svelte/icons/save'
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal'
  import X from 'lucide-svelte/icons/x'
  import { toast } from 'svelte-sonner'
  import { t } from '$lib/i18n.svelte'

  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { cn } from '@/shared/ui/cn'
  import { useElementSize } from './use-element-size.svelte'
  import type {
    BezierControlPoints,
    EasingConfig,
    EasingType,
    KeyframeRef,
    SpringParameters,
  } from '@/types/keyframe'

  import {
    EASING_PRESETS,
    SPRING_PRESETS,
    findMatchingPreset,
    presetDirection,
    presetMatchesEasing,
  } from './easings-dev-presets'
  import EasingCurveEditor from './easing-curve-editor.svelte'
  import { loadCustomPresets, saveCustomPresets } from './custom-easing-presets'
  import type { SegmentEasingChange, SegmentEasingUpdate } from './segment-easing-popover'
  import './easing-preset-thumbnail.css'

  interface SegmentEasingPopoverProps {
    /** Left offset of the connector band, in px within the timeline cell. */
    left: number
    /** Width of the connector band, in px. */
    width: number
    /** Relative frames used to keep the hit target aligned during live zoom. */
    fromFrame: number
    toFrame: number
    /** Keyframe(s) that begin this segment (one per property for group rows). */
    refs: KeyframeRef[]
    /** Representative easing (first ref). */
    easing: EasingType
    /** Representative easing config (first ref). */
    easingConfig?: EasingConfig
    /** True when a group segment's properties don't all share the same easing. */
    mixed?: boolean
    /** Held segments render dashed; used only for the band's resting style. */
    held?: boolean
    onChange: SegmentEasingChange
    onDragStart?: () => void
    onDragEnd?: () => void
  }

  let {
    left,
    width,
    fromFrame,
    toFrame,
    refs,
    easing,
    easingConfig,
    mixed = false,
    held = false,
    onChange,
    onDragStart,
    onDragEnd,
  }: SegmentEasingPopoverProps = $props()

  let editing = $state(false)
  let open = $state(false)
  let presetType = $state<PresetType>('Easing')
  let direction = $state<DirectionFilter>('all')
  // The user's last explicit preset pick, used to disambiguate identical-curve
  // presets (e.g. Snappy Out vs Out Expo) when highlighting the active one.
  let pickedName = $state<string | null>(null)
  let customPresets = $state.raw<EasingPreset[]>(loadCustomPresets())
  // null = not naming; string = the Save name field is open with this draft.
  let savingName = $state<string | null>(null)
  let trigger: HTMLButtonElement | null = null
  let content = $state<HTMLElement | null>(null)
  // The side (top/bottom) the popover resolved on first open, pinned for the
  // rest of the session. The preset grid and the taller spring/bezier editor
  // differ in height, and the resize panel animates between them — without
  // pinning, collision detection re-runs on that height change and can flip the
  // panel to the opposite side mid-transition. `sideLocked` gates
  // avoidCollisions so the FIRST view still gets a collision-aware placement; we
  // then freeze it.
  let lockedSide = $state<'top' | 'bottom'>('top')
  let sideLocked = $state(false)
  // Horizontal anchor for the popover, in the cell's coordinate space. Set from
  // the pointer position on open so the panel grows out of where the user
  // clicked the connector band, not from its center.
  let anchorLeft = $state<number | null>(null)
  // The easing as it was when the popover opened — the Reset fallback when the
  // curve isn't based on a named preset.
  let openBaseline = $state.raw<SegmentEasingUpdate | null>(null)

  // The timeline stops `pointerdown` propagation, which swallows the popover's
  // own outside-click dismissal. Listen in the capture phase (runs top-down,
  // before the timeline handlers) so an outside click reliably closes it.
  $effect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      // The composed path's first node is the real target even when the editor
      // lives in a shadow root (document listeners see the host otherwise).
      const target = (event.composedPath()[0] ?? event.target) as Node | null
      if (!target) return
      if (content?.contains(target)) return
      if (trigger?.contains(target)) return
      // Nested poppers (the preview-mode dropdown) portal outside the content,
      // so clicking one must not close the popover.
      const el = target instanceof Element ? target : target.parentElement
      if (el?.closest('[data-bits-floating-content-wrapper]')) return
      open = false
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  })

  // Pin the resolved side once the initial (preset) view is positioned. Read
  // `data-side` after a frame — it's set after the floating-position pass —
  // then lock it so later height changes (Edit ↔ Presets) don't re-flip.
  $effect(() => {
    // Don't unlock on close — that would flip the side back mid-exit-animation
    // and cause a flicker. Unlocking happens synchronously on open (below).
    if (!open) return
    const raf = requestAnimationFrame(() => {
      const side = content?.getAttribute('data-side')
      if (side === 'top' || side === 'bottom') {
        lockedSide = side
        sideLocked = true
      }
    })
    return () => cancelAnimationFrame(raf)
  })

  function handleOpenChange(next: boolean) {
    open = next
    if (next) {
      openBaseline = { easing, easingConfig }
      // Unlock before the content mounts so the fresh open gets a
      // collision-aware placement; the effect re-pins it a frame later.
      sideLocked = false
    } else {
      editing = false
      savingName = null
    }
  }

  // Center a padded band on the connector so it never covers the diamond hit
  // targets at either end; fall back to the full span for very short segments.
  const inset = $derived(width > 22 ? 8 : 0)
  const bandLeft = $derived(left + inset)
  const bandWidth = $derived(Math.max(2, width - inset * 2))
  // Clamp the click anchor to the band so the panel always tethers to the
  // segment; default to the band center before the first click.
  const effectiveAnchor = $derived(
    anchorLeft != null
      ? Math.min(bandLeft + bandWidth, Math.max(bandLeft, anchorLeft))
      : bandLeft + bandWidth / 2,
  )
  // The band (trigger) is the positioning reference. With `align="start"` the
  // panel's left edge sits at the band's left edge; `alignOffset` then shifts it
  // so the fixed-width panel is centered on the click point. Uses the static
  // width, never a measurement, so positioning doesn't depend on layout timing.
  const alignOffset = $derived(effectiveAnchor - bandLeft - PANEL_WIDTH / 2)

  // Prefer the user's explicit pick when its curve still matches the segment, so
  // an identical-curve twin (e.g. Snappy Out vs Out Expo) can't steal the
  // highlight; otherwise fall back to the first matching preset.
  const pickedPreset = $derived(
    pickedName != null
      ? [...EASING_PRESETS, ...SPRING_PRESETS, ...customPresets].find(
          (preset) => preset.name === pickedName,
        )
      : undefined,
  )
  const activePresetName = $derived(
    mixed
      ? null
      : pickedPreset && presetMatchesEasing(pickedPreset, easing, easingConfig)
        ? pickedPreset.name
        : (findMatchingPreset(easing, easingConfig)?.name ?? null),
  )
  const isHold = $derived(easing === 'hold')

  const filteredPresets = $derived(
    presetType === 'Spring'
      ? SPRING_PRESETS
      : EASING_PRESETS.filter(
          (preset) => direction === 'all' || presetDirection(preset.name) === direction,
        ),
  )

  function applyPreset(preset: EasingPreset) {
    pickedName = preset.name
    onChange(refs, presetToEasing(preset))
  }

  function applyBezier(bezier: BezierControlPoints, commit: boolean) {
    onChange(
      refs,
      { easing: 'cubic-bezier', easingConfig: { type: 'cubic-bezier', bezier } },
      { commit },
    )
  }

  function applySpring(spring: SpringParameters, commit: boolean) {
    onChange(refs, { easing: 'spring', easingConfig: { type: 'spring', spring } }, { commit })
  }

  function setHold() {
    onChange(refs, { easing: 'hold', easingConfig: undefined })
  }

  // Reset: jump back to the preset the curve is based on (the last one picked),
  // or the value the popover opened with if it was never a named preset. Unlike
  // undo, this is a single step back to the clean curve.
  const sameEasing = (a: SegmentEasingUpdate, b: SegmentEasingUpdate) =>
    a.easing === b.easing &&
    JSON.stringify(a.easingConfig ?? null) === JSON.stringify(b.easingConfig ?? null)
  const resetTarget = $derived<SegmentEasingUpdate | null>(
    pickedPreset ? presetToEasing(pickedPreset) : openBaseline,
  )
  const canReset = $derived(
    !!resetTarget && !mixed && !sameEasing(resetTarget, { easing, easingConfig }),
  )
  function handleReset() {
    if (resetTarget) onChange(refs, resetTarget)
  }

  // Save: persist the current tweaked curve as a reusable custom preset.
  const canSave = $derived(!mixed && (easing === 'cubic-bezier' || easing === 'spring'))
  // The saved custom preset this curve came from (if any) — the Update target.
  const activeCustomName = $derived(
    pickedName && customPresets.some((preset) => preset.name === pickedName) ? pickedName : null,
  )
  // Name for a brand-new preset (Save As) — the next free "Custom N".
  function newSuggestedName() {
    let n = customPresets.length + 1
    const taken = new Set(customPresets.map((preset) => preset.name))
    while (taken.has(`Custom ${n}`)) n++
    return `Custom ${n}`
  }
  function persistPreset(rawName: string) {
    const name = rawName.trim()
    if (!name) {
      toast.error(
        t('timeline.keyframeEditor.presetNameRequired', {
          defaultValue: 'Preset name is required',
        }),
      )
      return
    }
    let preset: EasingPreset | null = null
    if (easing === 'cubic-bezier' && easingConfig?.type === 'cubic-bezier' && easingConfig.bezier) {
      preset = { name, type: 'Easing', bezier: easingConfig.bezier }
    } else if (easing === 'spring' && easingConfig?.type === 'spring' && easingConfig.spring) {
      preset = { name, type: 'Spring', spring: easingConfig.spring }
    }
    if (!preset) return
    const next = [...customPresets.filter((p) => p.name !== name), preset]
    customPresets = next
    saveCustomPresets(next)
    pickedName = name
    presetType = preset.type
    savingName = null
  }
  // Header name of the curve being edited.
  const editingName = $derived(
    activeCustomName ??
      activePresetName ??
      (isHold
        ? t('timeline.keyframeEditor.easing.hold')
        : t('timeline.keyframeEditor.custom', { defaultValue: 'Custom' })),
  )
  function deleteCustomPreset(name: string) {
    const next = customPresets.filter((preset) => preset.name !== name)
    customPresets = next
    saveCustomPresets(next)
  }
  const myPresets = $derived(customPresets.filter((preset) => preset.type === presetType))

  // Focus the preset name field as it opens (React's `autoFocus`).
  let savingNameInput = $state<HTMLInputElement | null>(null)
  $effect(() => {
    savingNameInput?.focus()
  })

  // Resize panel: animates the panel's height whenever the active view — or the
  // content within a view (tab, direction filter) — changes. Width is fixed, so
  // this is a pure vertical morph: the visible content cross-fades while the
  // container springs to the new measured height, reading as a single fluid
  // resize rather than a hard jump.
  const viewKey = $derived(editing ? 'editor' : 'presets')
  const reduceMotion = prefersReducedMotion()
  let measure = $state<HTMLDivElement | null>(null)
  const measuredSize = useElementSize(() => measure)
  let panelHeight = $state<number | null>(null)
  // The views fade only after the panel's first render (motion's `initial={false}`).
  let viewFadeMs = $state(0)
  $effect(() => {
    if (measure) viewFadeMs = reduceMotion ? 0 : VIEW_FADE_MS
  })

  // Apply the first measured height instantly; only animate height changes that
  // happen afterwards (tab / view switches). Without this, the panel visibly
  // grows to its natural height the moment it opens.
  let springVelocity = 0
  $effect(() => {
    const target = measuredSize.height
    if (target <= 0) {
      panelHeight = null
      springVelocity = 0
      return
    }
    const from = untrack(() => panelHeight)
    if (from === null || reduceMotion) {
      panelHeight = target
      springVelocity = 0
      return
    }
    let position = from
    let last = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const dt = Math.min(0.064, Math.max(0, (now - last) / 1000))
      last = now
      // Semi-implicit Euler in 1ms substeps keeps the stiff spring stable.
      const substeps = Math.max(1, Math.ceil(dt / 0.001))
      const h = dt / substeps
      for (let i = 0; i < substeps; i++) {
        const force =
          -HEIGHT_SPRING.stiffness * (position - target) - HEIGHT_SPRING.damping * springVelocity
        springVelocity += (force / HEIGHT_SPRING.mass) * h
        position += springVelocity * h
      }
      if (Math.abs(springVelocity) < 2 && Math.abs(position - target) < 0.5) {
        springVelocity = 0
        panelHeight = target
        return
      }
      panelHeight = position
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  })
</script>

{#snippet thumbFrame(d: string)}
  <!-- Wrapper: muted dot grid + square SVG curve + orange marker that rides the
       curve on hover (animation defined in easing-preset-thumbnail.css). -->
  <div class="ep-thumb shrink-0 overflow-hidden rounded" style:width="{T_SIZE}px" style:height="{T_SIZE}px">
    <svg width={T_SIZE} height={T_SIZE} viewBox="0 0 {T_SIZE} {T_SIZE}" class="absolute inset-0" aria-hidden="true">
      <path {d} class="fill-none stroke-foreground/90" stroke-width={1.5} stroke-linecap="round" />
    </svg>
    <span class="ep-dot" style:offset-path="path('{d}')" aria-hidden="true"></span>
  </div>
{/snippet}

{#snippet presetChip(
  label: string,
  active: boolean,
  onClick: () => void,
  thumbPath: string,
  onDelete?: () => void,
  deleteLabel?: string,
)}
  <!-- The select action and the delete action are sibling buttons inside a group
       container (not a control nested in a button), so both have real button
       semantics and are keyboard-reachable. -->
  <div
    class={cn(
      'group relative flex flex-col rounded-md border transition-colors',
      active ? 'border-blue-500/70 bg-blue-500/10' : 'border-transparent hover:border-border hover:bg-muted/50',
    )}
  >
    <button type="button" onclick={onClick} title={label} class="flex w-full flex-col items-center gap-1 rounded-md p-1.5">
      {@render thumbFrame(thumbPath)}
      <span class="w-full truncate text-center text-[10px] leading-tight text-foreground">
        {label}
      </span>
    </button>
    {#if onDelete}
      <!-- Sibling of the select button, so this can't also apply the preset;
           stopPropagation is belt-and-suspenders against any container handler. -->
      <button
        type="button"
        aria-label={deleteLabel}
        onclick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        class="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
      >
        <X class="h-2.5 w-2.5" />
      </button>
    {/if}
  </div>
{/snippet}

{#snippet panelView()}
  <div style:width="{PANEL_WIDTH}px">
    <!-- Header: current selection + Edit / back toggle. -->
    <div class="flex h-9 items-center justify-between border-b border-border/60 px-3">
      {#if editing}
        <div class="flex min-w-0 items-center gap-1.5 text-xs">
          <button
            type="button"
            class="flex shrink-0 items-center gap-1 text-muted-foreground hover:text-foreground"
            onclick={() => (editing = false)}
          >
            <ChevronLeft class="h-3.5 w-3.5" />
            {t('timeline.keyframeEditor.presets', { defaultValue: 'Presets' })}
          </button>
          {#if !mixed}
            <span class="truncate text-muted-foreground/70">— {editingName}</span>
          {/if}
        </div>
      {:else}
        <span class="truncate text-xs font-medium text-foreground">
          {mixed
            ? t('timeline.keyframeEditor.mixedCurves')
            : (activePresetName ??
              (isHold ? t('timeline.keyframeEditor.easing.hold') : t('timeline.keyframeEditor.custom')))}
        </span>
      {/if}
      {#if !editing}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 gap-1 px-1.5 text-[11px]"
          onclick={() => (editing = true)}
        >
          <SlidersHorizontal class="h-3 w-3" />
          {t('timeline.keyframeEditor.edit', { defaultValue: 'Edit' })}
        </Button>
      {/if}
    </div>

    {#if editing}
      <div class="p-3">
        <EasingCurveEditor
          {easing}
          config={easingConfig}
          onChangeBezier={applyBezier}
          onChangeSpring={applySpring}
          {onDragStart}
          {onDragEnd}
        />
        <div class="mt-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canReset}
            onclick={handleReset}
            class="h-6 gap-1 px-1.5 text-[11px]"
          >
            <RotateCcw class="h-3 w-3" />
            {t('timeline.keyframeEditor.reset', { defaultValue: 'Reset' })}
          </Button>
          {#if savingName === null}
            <div class="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!canSave}
                onclick={() => (savingName = newSuggestedName())}
                class="h-6 gap-1 px-1.5 text-[11px]"
              >
                <Plus class="h-3 w-3" />
                {t('timeline.keyframeEditor.saveAsPreset', { defaultValue: 'Save As' })}
              </Button>
              {#if activeCustomName}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canSave}
                  onclick={() => persistPreset(activeCustomName)}
                  class="h-6 gap-1 px-1.5 text-[11px]"
                >
                  <Save class="h-3 w-3" />
                  {t('timeline.keyframeEditor.updatePreset', { defaultValue: 'Update' })}
                </Button>
              {/if}
            </div>
          {:else}
            <div class="flex items-center gap-1">
              <Input
                bind:ref={savingNameInput}
                autocomplete="off"
                data-bwignore="true"
                value={savingName}
                oninput={(event) => (savingName = event.currentTarget.value)}
                onkeydown={(event) => {
                  // Keep Enter/Escape inside the field so they don't reach the
                  // popover (close) or the timeline key handlers.
                  event.stopPropagation()
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    persistPreset(savingName ?? '')
                  } else if (event.key === 'Escape') {
                    savingName = null
                  }
                }}
                placeholder={t('timeline.keyframeEditor.presetName', {
                  defaultValue: 'Preset name',
                })}
                class="h-6 w-28 px-1.5 text-[11px]"
              />
              <Button
                type="button"
                size="sm"
                onclick={() => persistPreset(savingName ?? '')}
                class="h-6 px-2 text-[11px]"
              >
                {t('timeline.keyframeEditor.savePreset', { defaultValue: 'Save' })}
              </Button>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Filter bar: type (Cubic Easing / Spring) + direction. -->
      <div class="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
        <div class="flex items-center gap-3 text-xs">
          {#each PRESET_TYPES as type (type)}
            <button
              type="button"
              onclick={() => (presetType = type)}
              class={cn(
                'transition-colors',
                presetType === type ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {type === 'Easing'
                ? t('timeline.keyframeEditor.cubicEasing', {
                    defaultValue: 'Cubic Easing',
                  })
                : t('timeline.keyframeEditor.spring')}
            </button>
          {/each}
        </div>
        {#if presetType === 'Easing'}
          <div class="flex items-center gap-2 text-[11px]">
            {#each DIRECTION_FILTERS as filter (filter.value)}
              <button
                type="button"
                onclick={() => (direction = filter.value)}
                class={cn(
                  'transition-colors',
                  direction === filter.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(filter.labelKey, { defaultValue: filter.defaultValue })}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="max-h-[300px] overflow-y-auto p-2">
        {#if myPresets.length > 0}
          <div class="mb-2">
            <div class="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('timeline.keyframeEditor.customPresets', { defaultValue: 'Custom' })}
            </div>
            <div class="grid grid-cols-4 gap-1">
              {#each myPresets as preset (preset.name)}
                {@render presetChip(
                  preset.name,
                  preset.name === activePresetName,
                  () => applyPreset(preset),
                  presetThumbPath(preset),
                  () => deleteCustomPreset(preset.name),
                  t('timeline.keyframeEditor.deletePreset', {
                    defaultValue: 'Delete preset',
                  }),
                )}
              {/each}
            </div>
          </div>
        {/if}
        {#if presetType === 'Easing'}
          <div class="grid grid-cols-4 gap-1">
            {@render presetChip(t('timeline.keyframeEditor.easing.hold'), isHold, setHold, HOLD_THUMB_PATH)}
          </div>
        {/if}
        <div class="mt-1 grid grid-cols-4 gap-1">
          {#each filteredPresets as preset (preset.name)}
            {@render presetChip(
              preset.name,
              preset.name === activePresetName,
              () => applyPreset(preset),
              presetThumbPath(preset),
            )}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<Popover {open} onOpenChange={handleOpenChange}>
  <PopoverTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        bind:this={trigger}
        type="button"
        data-testid="segment-easing-{refs[0]?.property}-{refs[0]?.keyframeId}"
        data-dopesheet-from-frame={fromFrame}
        data-dopesheet-to-frame={toFrame}
        data-dopesheet-responsive-inset={8}
        data-dopesheet-min-width={2}
        class={cn(
          'absolute z-[6] h-2 -translate-y-1/2 rounded-full',
          'bg-transparent hover:bg-blue-400/25 focus-visible:bg-blue-400/30',
          'cursor-pointer outline-none transition-colors',
        )}
        style:left="{bandLeft}px"
        style:width="{bandWidth}px"
        style:top="50%"
        onpointerdown={(event) => {
          event.stopPropagation()
          // Record where along the band the user pressed (in cell coords) so
          // the popover anchors there. Runs before the click that opens it.
          const rect = event.currentTarget.getBoundingClientRect()
          anchorLeft = event.currentTarget.offsetLeft + (event.clientX - rect.left)
          ;(props.onpointerdown as ((event: PointerEvent) => void) | undefined)?.(event)
        }}
        onclick={(event) => {
          event.stopPropagation()
          ;(props.onclick as ((event: MouseEvent) => void) | undefined)?.(event)
        }}
        title={t('timeline.keyframeEditor.editCurve', { defaultValue: 'Easing' })}
        aria-label={t('timeline.keyframeEditor.editCurve', { defaultValue: 'Easing' })}
      >
        <span class="sr-only">{held ? 'hold' : easing}</span>
      </button>
    {/snippet}
  </PopoverTrigger>
  <!-- Until the initial view is placed, let the popover pick the side with
       collision avoidance; afterwards pin that side so switching to the taller
       editor view can't flip the panel to the opposite direction.
       Automatic dismissal (focus-out, internal focus shifts, its own outside
       detection) is disabled: the popover closes ONLY via the capture-phase
       outside-click listener above, so interacting with the sliders / inputs /
       preset grid never auto-closes it. -->
  <PopoverContent
    bind:ref={content}
    align="start"
    {alignOffset}
    collisionPadding={12}
    side={sideLocked ? lockedSide : 'top'}
    avoidCollisions={!sideLocked}
    class="w-auto max-w-[calc(100vw-24px)] overflow-hidden p-0"
    onpointerdown={(event: PointerEvent) => event.stopPropagation()}
    onOpenAutoFocus={(event) => event.preventDefault()}
    onFocusOutside={(event) => event.preventDefault()}
    onInteractOutside={(event) => event.preventDefault()}
  >
    <div class="overflow-hidden" style:height={panelHeight === null ? 'auto' : `${panelHeight}px`}>
      <!-- `relative` anchors the exiting view (it leaves the flow as it fades);
           `w-fit` lets the wrapper size to the active view's explicit width so
           the measured box is exact. -->
      <div bind:this={measure} class="relative w-fit">
        {#key viewKey}
          <div in:viewFade={{ duration: viewFadeMs }} out:viewFade={{ duration: viewFadeMs, exit: true }}>
            {@render panelView()}
          </div>
        {/key}
      </div>
    </div>
  </PopoverContent>
</Popover>
