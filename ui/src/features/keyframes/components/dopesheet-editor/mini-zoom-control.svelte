<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { cn } from '@/shared/ui/cn'
  import { useRafCoalescedValue } from '../use-raf-coalesced-value.svelte'
  import { clampZoomValue, setPointerCaptureSafely } from './dopesheet-utils'

  interface MiniZoomControlProps {
    icon: Snippet
    label: string
    value: number
    disabled?: boolean
    onValueChange: (value: number) => void
    onReset?: () => void
  }

  let { icon, label, value, disabled = false, onValueChange, onReset }: MiniZoomControlProps =
    $props()

  let track: HTMLButtonElement | null = null
  const { queue: queueValueChange, flushNow: flushValueChange } = useRafCoalescedValue(
    () => onValueChange,
  )

  function updateValueFromClientX(clientX: number) {
    if (!track) {
      return
    }

    const rect = track.getBoundingClientRect()
    const horizontalPadding = 4
    const usableWidth = Math.max(1, rect.width - horizontalPadding * 2)
    const nextValue = ((clientX - rect.left - horizontalPadding) / usableWidth) * 100
    queueValueChange(clampZoomValue(nextValue))
  }

  function handlePointerDown(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    if (disabled || event.button !== 0) {
      return
    }

    event.preventDefault()
    setPointerCaptureSafely(event.currentTarget, event.pointerId)
    updateValueFromClientX(event.clientX)
  }

  function handlePointerMove(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
      return
    }

    updateValueFromClientX(event.clientX)
  }

  function handlePointerRelease(event: PointerEvent & { currentTarget: HTMLButtonElement }) {
    flushValueChange()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleDoubleClick() {
    // Commit any pointer value first so it cannot overwrite the reset on the
    // next animation frame.
    flushValueChange()
    onReset?.()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) {
      return
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onValueChange(clampZoomValue(value - 5))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onValueChange(clampZoomValue(value + 5))
    } else if (event.key === 'Home') {
      event.preventDefault()
      onValueChange(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      onValueChange(100)
    }
  }

  const thumbLeft = $derived(
    `calc(4px + ${(clampZoomValue(value) / 100).toFixed(4)} * (100% - 8px))`,
  )
</script>

<div class="flex items-center gap-1 rounded-md border border-border/70 bg-background/70 px-1 py-0.5">
  <span class="flex h-4 w-4 items-center justify-center text-muted-foreground">{@render icon()}</span>
  <button
    bind:this={track}
    type="button"
    role="slider"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(clampZoomValue(value))}
    {disabled}
    title={onReset ? `${label} - double-click to reset` : label}
    class={cn(
      'relative h-5 w-16 rounded-sm outline-none transition-colors',
      disabled ? 'cursor-default opacity-50' : 'cursor-ew-resize',
    )}
    ondblclick={onReset ? handleDoubleClick : undefined}
    onkeydown={handleKeyDown}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerRelease}
    onpointercancel={handlePointerRelease}
  >
    <span
      class="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-muted-foreground/45"
    ></span>
    <span
      class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
      style:left={thumbLeft}
    ></span>
  </button>
</div>
