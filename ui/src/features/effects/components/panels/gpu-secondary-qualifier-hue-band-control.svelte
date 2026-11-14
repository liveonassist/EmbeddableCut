<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  function hueToPercent(hue: number): number {
    return (clamp(hue, 0, 360) / 360) * 100
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'

  interface HueBandControlProps {
    center: number
    width: number
    softness: number
    disabled: boolean
    onLiveChange: (value: number) => void
    onCommit: (value: number) => void
  }

  /** `HueBandControl` from gpu-secondary-qualifier-panel.tsx: the hue range selector. */
  let { center, width, softness, disabled, onLiveChange, onCommit }: HueBandControlProps = $props()

  let control: HTMLButtonElement | null = $state(null)
  let coreBand: HTMLSpanElement | null = $state(null)
  let softBand: HTMLSpanElement | null = $state(null)
  let marker: HTMLSpanElement | null = $state(null)
  let dragging = false
  // svelte-ignore state_referenced_locally
  let dragStartCenter = center
  // svelte-ignore state_referenced_locally
  let currentCenter = center
  let rect: DOMRect | null = null
  let pendingLiveValue: number | null = null
  let liveRaf: number | null = null

  const updateVisual = (nextCenter: number) => {
    currentCenter = nextCenter
    const centerPct = hueToPercent(nextCenter)
    const corePct = (clamp(width, 0, 180) / 360) * 100
    const featherPct = (clamp(softness, 0, 120) / 360) * 100
    const setBandBounds = (element: HTMLSpanElement | null, radius: number) => {
      if (!element) return
      element.style.left = `${clamp(centerPct - radius, 0, 100)}%`
      element.style.right = `${clamp(100 - centerPct - radius, 0, 100)}%`
    }

    setBandBounds(coreBand, corePct)
    setBandBounds(softBand, corePct + featherPct)
    if (marker) marker.style.left = `${centerPct}%`
    control?.setAttribute('aria-valuenow', String(Math.round(nextCenter)))
    control?.setAttribute('aria-valuetext', `${Math.round(nextCenter)} degrees`)
  }

  const scheduleLiveChange = (nextCenter: number) => {
    pendingLiveValue = nextCenter
    if (liveRaf !== null) return
    liveRaf = requestAnimationFrame(() => {
      liveRaf = null
      const pending = pendingLiveValue
      pendingLiveValue = null
      if (pending !== null) onLiveChange(pending)
    })
  }

  const cancelScheduledLiveChange = () => {
    if (liveRaf !== null) cancelAnimationFrame(liveRaf)
    liveRaf = null
    pendingLiveValue = null
  }

  $effect(() => {
    const next = center
    void [width, softness, control, coreBand, softBand, marker]
    untrack(() => {
      if (!dragging) updateVisual(next)
    })
  })

  $effect(() => cancelScheduledLiveChange)

  const getHueFromClient = (clientX: number) => {
    const bounds = rect ?? control?.getBoundingClientRect()
    if (!bounds) return currentCenter
    if (bounds.width <= 0) return center
    return clamp(((clientX - bounds.left) / bounds.width) * 360, 0, 360)
  }

  const handlePointerDown = (event: PointerEvent & { currentTarget: HTMLButtonElement }) => {
    if (disabled || dragging) return
    event.currentTarget.setPointerCapture(event.pointerId)
    rect = event.currentTarget.getBoundingClientRect()
    dragging = true
    dragStartCenter = center
    const nextCenter = getHueFromClient(event.clientX)
    updateVisual(nextCenter)
    scheduleLiveChange(nextCenter)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (disabled || !dragging) return
    const nextCenter = getHueFromClient(event.clientX)
    updateVisual(nextCenter)
    scheduleLiveChange(nextCenter)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (disabled || !dragging) return
    const nextCenter = getHueFromClient(event.clientX)
    updateVisual(nextCenter)
    cancelScheduledLiveChange()
    dragging = false
    rect = null
    onCommit(nextCenter)
  }

  const handlePointerCancel = () => {
    if (!dragging) return
    const initialCenter = dragStartCenter
    cancelScheduledLiveChange()
    dragging = false
    rect = null
    updateVisual(initialCenter)
    onCommit(initialCenter)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = center - (event.shiftKey ? 10 : 1)
    if (event.key === 'ArrowRight') next = center + (event.shiftKey ? 10 : 1)
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = 360
    if (next === null) return
    event.preventDefault()
    const clamped = clamp(next, 0, 360)
    updateVisual(clamped)
    onLiveChange(clamped)
    onCommit(clamped)
  }

  const centerPct = $derived(hueToPercent(center))
  const corePct = $derived((clamp(width, 0, 180) / 360) * 100)
  const featherPct = $derived((clamp(softness, 0, 120) / 360) * 100)
</script>

<button
  bind:this={control}
  type="button"
  {disabled}
  role="slider"
  aria-label={t('effects.qualifier.hueBand')}
  aria-valuemin={0}
  aria-valuemax={360}
  aria-valuenow={Math.round(center)}
  aria-valuetext={`${Math.round(center)} degrees`}
  class={cn(
    'relative h-8 w-full overflow-hidden rounded-sm border border-border/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair',
  )}
  style:touch-action="none"
  style:background-image="linear-gradient(90deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)"
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  onkeydown={handleKeyDown}
>
  <span
    bind:this={coreBand}
    class="absolute inset-y-0 border-x border-white/60 bg-white/20 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
    style:left="{clamp(centerPct - corePct, 0, 100)}%"
    style:right="{clamp(100 - centerPct - corePct, 0, 100)}%"
  ></span>
  <span
    bind:this={softBand}
    class="absolute inset-y-0 border-x border-white/35 bg-white/10"
    style:left="{clamp(centerPct - corePct - featherPct, 0, 100)}%"
    style:right="{clamp(100 - centerPct - corePct - featherPct, 0, 100)}%"
  ></span>
  <span
    bind:this={marker}
    class="absolute top-0 h-full w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
    style:left="{centerPct}%"
  ></span>
</button>
