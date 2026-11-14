<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { getParamDecimals, SCRUB_THRESHOLD_PX } from './gpu-wheels-panel-shared'

  interface DockNumberInputProps {
    ariaLabel?: string
    name: string
    value: string
    min?: number
    max?: number
    step?: number
    decimals?: number
    disabled: boolean
    class: string
    onLive: (raw: string) => void
    onCommit: (raw: string) => void
  }

  /**
   * `DockNumberInput` from gpu-wheels-panel.tsx. Horizontal-scrub numeric field
   * (After Effects style): dragging anywhere on the field slides the value by
   * one step per pixel (Shift = 0.1x fine), a plain click opens text editing.
   * While interacting only the cheap live preview path runs; the timeline commit
   * (undo entry + auto-keyframe scan) lands once per gesture — on release,
   * Enter, blur, or arrow-key release.
   */
  let {
    ariaLabel,
    name,
    value,
    min,
    max,
    step = 1,
    decimals: decimalsProp,
    disabled,
    class: className,
    onLive,
    onCommit,
  }: DockNumberInputProps = $props()

  let input: HTMLInputElement | null = $state(null)
  let draft = $state<string | null>(null)
  // Plain mirror of draft — blur fires synchronously after Enter/Escape, so
  // guards read it instead of waiting on the reactive update.
  let draftRef: string | null = null
  let drag: { startX: number; startValue: number; scrubbed: boolean } | null = null

  const updateDraft = (raw: string | null) => {
    draftRef = raw
    draft = raw
  }

  const decimals = $derived(decimalsProp ?? getParamDecimals(step))

  const clampValue = (next: number) => {
    let result = next
    if (min !== undefined) result = Math.max(min, result)
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  const commit = (raw: string) => {
    updateDraft(null)
    onCommit(raw)
  }

  const revert = () => {
    updateDraft(null)
    onLive(value)
  }

  const handlePointerDown = (event: PointerEvent & { currentTarget: HTMLInputElement }) => {
    if (disabled || event.button !== 0) return
    // Already editing — let the caret/selection behave normally.
    if (document.activeElement === input) return
    // Keep focus off until release decides between scrub and click-to-edit.
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const parsed = Number(value)
    drag = {
      startX: event.clientX,
      startValue: Number.isFinite(parsed) ? parsed : 0,
      scrubbed: false,
    }
  }

  const handlePointerMove = (event: PointerEvent) => {
    const current = drag
    if (!current) return
    const dx = event.clientX - current.startX
    if (!current.scrubbed && Math.abs(dx) < SCRUB_THRESHOLD_PX) return
    current.scrubbed = true
    const sensitivity = event.shiftKey ? 0.1 : 1
    const raw = clampValue(current.startValue + dx * sensitivity * step).toFixed(decimals)
    updateDraft(raw)
    onLive(raw)
  }

  const handlePointerUp = (event: PointerEvent & { currentTarget: HTMLInputElement }) => {
    const current = drag
    drag = null
    if (!current) return
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (current.scrubbed) {
      commit(draftRef ?? value)
    } else {
      input?.focus()
      input?.select()
    }
  }

  const handlePointerCancel = () => {
    const current = drag
    drag = null
    if (current?.scrubbed) revert()
  }

  const stepByKey = (direction: number, fine: boolean) => {
    const parsed = Number(draftRef ?? value)
    const current = Number.isFinite(parsed) ? parsed : 0
    const raw = clampValue(current + direction * step * (fine ? 10 : 1)).toFixed(decimals)
    updateDraft(raw)
    onLive(raw)
  }
</script>

<input
  bind:this={input}
  aria-label={ariaLabel}
  type="text"
  {name}
  autocomplete="off"
  inputmode="decimal"
  value={draft ?? value}
  {disabled}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
  oninput={(event) => {
    const raw = event.currentTarget.value
    updateDraft(raw)
    onLive(raw)
  }}
  onkeydown={(event) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      if (draftRef !== null) commit(event.currentTarget.value)
      event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      if (draftRef !== null) revert()
      event.currentTarget.blur()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      stepByKey(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey)
    }
  }}
  onkeyup={(event) => {
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && draftRef !== null) {
      commit(event.currentTarget.value)
    }
  }}
  onblur={(event) => {
    if (draftRef !== null) commit(event.currentTarget.value)
  }}
  style:touch-action="none"
  class={cn('cursor-ew-resize select-none focus:cursor-text focus:select-auto', className)}
/>
