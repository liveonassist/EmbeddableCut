<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import { t } from '$lib/i18n.svelte'
  import {
    clamp,
    DOCK_DISC_BACKGROUND,
    DOCK_RING_COVER_COLOR,
    DOCK_RING_INSET,
    DOCK_RING_METAL_GRADIENT,
    DOCK_RING_THICKNESS,
    getHueAmountFromClient,
    getKeyboardWheelTarget,
    PUCK_RADIUS_PX,
    SIDEBAR_DISC_BACKGROUND,
    wrapHue,
  } from './gpu-wheels-panel-shared'

  interface WheelControlProps {
    label: string
    hue: number
    amount: number
    size: number
    disabled: boolean
    compact?: boolean
    dock?: boolean
    dockFields?: Snippet
    /** Master ring fill 0..1 — fraction of the bright ring revealed (dock only). */
    masterRingFill?: number
    /** Anchor angle (deg from 12 o'clock) where the ring reveal starts. */
    masterRingFromDeg?: number
    onLiveChange: (hue: number, amount: number) => void
    onCommit: (hue: number, amount: number) => void
    onReset: () => void
  }

  /** `WheelControl` from gpu-wheels-panel.tsx, with its header/readout/reset fragments inline. */
  let {
    label,
    hue,
    amount,
    size,
    disabled,
    compact = false,
    dock = false,
    dockFields,
    masterRingFill = 0,
    masterRingFromDeg = 0,
    onLiveChange,
    onCommit,
    onReset,
  }: WheelControlProps = $props()

  let wheel: HTMLButtonElement | null = $state(null)
  let dragging = $state(false)
  // svelte-ignore state_referenced_locally
  let localHue = $state(hue)
  // svelte-ignore state_referenced_locally
  let localAmount = $state(clamp(amount, 0, 1))

  $effect(() => {
    const nextHue = hue
    const nextAmount = clamp(amount, 0, 1)
    if (!dragging) {
      localHue = nextHue
      localAmount = nextAmount
    }
  })

  const updateFromPointer = (event: PointerEvent) => {
    if (!wheel) return null
    const next = getHueAmountFromClient(event.clientX, event.clientY, wheel)
    localHue = next.hue
    localAmount = next.amount
    onLiveChange(next.hue, next.amount)
    return next
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (disabled) return
    if (!wheel) return
    wheel.setPointerCapture(event.pointerId)
    dragging = true
    updateFromPointer(event)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (disabled || !dragging) return
    updateFromPointer(event)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (disabled || !dragging) return
    const next = updateFromPointer(event)
    if (next) {
      onCommit(next.hue, next.amount)
    } else {
      onCommit(localHue, localAmount)
    }
    dragging = false
  }

  const handlePointerCancel = () => {
    if (!dragging) return
    onCommit(localHue, localAmount)
    dragging = false
  }

  const commitKeyboardChange = (nextHue: number, nextAmount: number) => {
    const normalizedHue = wrapHue(nextHue)
    const normalizedAmount = clamp(nextAmount, 0, 1)
    localHue = normalizedHue
    localAmount = normalizedAmount
    onLiveChange(normalizedHue, normalizedAmount)
    onCommit(normalizedHue, normalizedAmount)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (disabled) return
    const target = getKeyboardWheelTarget(event.key, localHue, localAmount)
    if (!target) return
    event.preventDefault()
    commitKeyboardChange(target[0], target[1])
  }

  // In the dock the disc sits inside the master ring, so the interactive
  // wheel shrinks by the ring inset on each side.
  const discSize = $derived(dock ? size - DOCK_RING_INSET * 2 : size)
  const displayTrackRadius = $derived(discSize / 2 - PUCK_RADIUS_PX - 1)
  const puckX = $derived(
    Math.cos((localHue * Math.PI) / 180) * (displayTrackRadius * localAmount),
  )
  const puckY = $derived(
    Math.sin((localHue * Math.PI) / 180) * (displayTrackRadius * localAmount),
  )
  const resetLabel = $derived(t('effects.wheels.resetWheel', { name: label }))

  // Donut mask leaves only the outer ring band visible. The black cover
  // (top conic layer) shrinks as the fill grows, revealing the metallic
  // ring clockwise from 12 o'clock.
  const ringMask = `radial-gradient(closest-side, transparent calc(100% - ${DOCK_RING_THICKNESS}px), #000 calc(100% - ${DOCK_RING_THICKNESS - 1}px))`
  const revealDeg = $derived(clamp(masterRingFill, 0, 1) * 360)
</script>

{#snippet wheelButton()}
  <button
    bind:this={wheel}
    type="button"
    {disabled}
    aria-disabled={disabled}
    aria-label={t('effects.wheels.adjustWheel', {
      name: label,
      defaultValue: `Adjust ${label} wheel`,
    })}
    class={`relative rounded-full border border-border/70 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-crosshair'}`}
    style:width="{discSize}px"
    style:height="{discSize}px"
    style:touch-action="none"
    style:box-shadow={dock ? 'inset 0 0 0 1px rgba(255,255,255,0.07)' : undefined}
    style:background-image={dock ? DOCK_DISC_BACKGROUND : SIDEBAR_DISC_BACKGROUND}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
    onkeydown={handleKeyDown}
  >
    {#if dock}
      <span class="absolute left-1/2 top-[3%] h-[94%] w-px -translate-x-1/2 bg-white/15"></span>
      <span class="absolute left-[3%] top-1/2 h-px w-[94%] -translate-y-1/2 bg-white/15"></span>
    {/if}
    <div
      class="absolute rounded-full border border-black/60 shadow-sm"
      style:width="{PUCK_RADIUS_PX * 2}px"
      style:height="{PUCK_RADIUS_PX * 2}px"
      style:background="#f8fafc"
      style:left="50%"
      style:top="50%"
      style:transform="translate(-50%, -50%) translate({puckX}px, {puckY}px)"
    ></div>
  </button>
{/snippet}

<div
  class={cn(
    'flex min-w-0 flex-col items-center',
    dock ? 'gap-2' : 'gap-1',
    compact && 'gap-0.5',
  )}
>
  {#if dock}
    <div class="flex h-5 w-full items-center justify-center gap-1">
      <span class="truncate text-[11px] font-semibold text-foreground">{label}</span>
      <Button
        variant="ghost"
        size="icon"
        class="h-5 w-5 text-muted-foreground"
        onclick={onReset}
        {disabled}
        title={resetLabel}
        aria-label={resetLabel}
      >
        <RotateCcw class="h-3 w-3" />
      </Button>
    </div>
  {/if}
  {#if dock}
    <div class="relative shrink-0" style:width="{size}px" style:height="{size}px">
      <div
        aria-hidden="true"
        class="absolute inset-0 rounded-full"
        style:background="conic-gradient(from {masterRingFromDeg}deg, transparent 0deg {Math.max(
          0,
          revealDeg - 2,
        )}deg, {DOCK_RING_COVER_COLOR} {revealDeg}deg 360deg), {DOCK_RING_METAL_GRADIENT}"
        style:-webkit-mask={ringMask}
        style:mask={ringMask}
      ></div>
      <div class="absolute" style:left="{DOCK_RING_INSET}px" style:top="{DOCK_RING_INSET}px">
        {@render wheelButton()}
      </div>
    </div>
  {:else}
    {@render wheelButton()}
  {/if}
  {#if !dock}
    <div class="text-[10px] text-muted-foreground">{label}</div>
    <div class="text-[10px] font-mono text-muted-foreground">
      {Math.round(localHue)} deg | {Math.round(localAmount * 100)}%
    </div>
  {/if}
  {#if dock}
    {@render dockFields?.()}
  {/if}
  {#if !compact && !dock}
    <Button
      variant="ghost"
      size="icon"
      class="h-5 w-5"
      onclick={onReset}
      {disabled}
      title={resetLabel}
      aria-label={resetLabel}
    >
      <RotateCcw class="w-3 h-3" />
    </Button>
  {/if}
</div>
