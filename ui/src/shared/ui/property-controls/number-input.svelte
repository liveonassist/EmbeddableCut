<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  type MixedValue = number | 'mixed'

  interface NumberInputProps {
    value: MixedValue
    /** Called on final commit (blur, enter, mouseup). Updates the actual value. */
    onChange: (value: number) => void
    /** Called during scrub/drag for live preview. If not provided, onChange is used. */
    onLiveChange?: (value: number) => void
    label?: string
    unit?: string
    min?: number
    max?: number
    step?: number
    formatInputValue?: (value: number) => string
    parseInputValue?: (rawValue: string) => number
    disabled?: boolean
    scrubEnabled?: boolean
    placeholder?: string
    class?: string
    /** Width of the unit suffix area - use consistent value across inputs for alignment */
    unitWidth?: number
    /** Makes the unit suffix a button — for inputs whose unit can be switched. */
    onUnitClick?: () => void
    /** Tooltip / accessible name for the unit button. */
    unitTitle?: string
  }

  // Throttle live change calls to prevent overwhelming composition re-renders
  const LIVE_CHANGE_THROTTLE_MS = 16 // ~60fps max
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  /**
   * Compact number input with optional label prefix and unit suffix.
   * Supports:
   * - Click-drag (scrub) to adjust value
   * - Arrow keys for increment/decrement
   * - Shift+Arrow for 10x step
   * - 'Mixed' state for multi-selection with different values
   */
  let {
    value,
    onChange,
    onLiveChange,
    label,
    unit,
    min,
    max,
    step = 1,
    formatInputValue,
    parseInputValue,
    disabled = false,
    scrubEnabled = true,
    placeholder,
    class: className,
    unitWidth = 20,
    onUnitClick,
    unitTitle,
  }: NumberInputProps = $props()

  let input = $state<HTMLInputElement | null>(null)
  let isScrubbing = $state(false)
  let scrubStart: { x: number; startValue: number } | null = null
  let scrubValue: number | null = null
  let lastLiveChange = 0

  const clamp = (v: number) => {
    let result = v
    if (min !== undefined) result = Math.max(min, result)
    if (max !== undefined) result = Math.min(max, result)
    return result
  }

  // Format number for display (2 decimal places for decimal steps, integer for step=1)
  const formatValue = (v: number) => {
    if (formatInputValue) return formatInputValue(v)
    if (step >= 1) return String(Math.round(v))
    return v.toFixed(2)
  }

  function initialLocalValue(): string {
    if (value === 'mixed') return ''
    if (step >= 1) return String(Math.round(value))
    return value.toFixed(2)
  }

  let localValue = $state(initialLocalValue())

  const resetLocalValue = () => {
    localValue = value === 'mixed' ? '' : formatValue(value)
  }

  const commitLocalValue = (rawValue: string) => {
    const parsed = parseInputValue ? parseInputValue(rawValue) : parseFloat(rawValue)
    if (!isNaN(parsed)) {
      const committedValue = clamp(parsed)
      localValue = formatValue(committedValue)
      onChange(committedValue)
      return
    }

    resetLocalValue()
  }

  // Sync local value with prop value
  $effect(() => {
    const nextValue = value === 'mixed' ? '' : formatValue(value)
    if (!input || document.activeElement !== input) {
      localValue = nextValue
    }
  })

  const handleInputBlur = (e: FocusEvent & { currentTarget: HTMLInputElement }) => {
    commitLocalValue(e.currentTarget.value)
  }

  const handleKeyDown = (e: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (e.key === 'Enter') {
      commitLocalValue(e.currentTarget.value)
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      resetLocalValue()
      e.currentTarget.blur()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const currentValue = value === 'mixed' ? 0 : value
      const multiplier = e.shiftKey ? 10 : 1
      const delta = e.key === 'ArrowUp' ? step * multiplier : -step * multiplier
      const nextValue = clamp(currentValue + delta)
      localValue = formatValue(nextValue)
      onChange(nextValue)
    }
  }

  // Scrub handling - uses onLiveChange during drag, onChange on commit
  const handleMouseDown = (e: MouseEvent) => {
    if (!scrubEnabled || disabled) return
    if (e.target === input) return // Don't scrub when clicking input

    const startValue = value === 'mixed' ? 0 : value
    scrubStart = { x: e.clientX, startValue }
    scrubValue = startValue
    isScrubbing = true

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!scrubStart) return
      const dx = moveEvent.clientX - scrubStart.x
      const sensitivity = moveEvent.shiftKey ? 0.1 : 1
      const delta = dx * sensitivity * step
      const newValue = clamp(scrubStart.startValue + delta)
      scrubValue = newValue
      // Update displayed value during scrub
      localValue = formatValue(newValue)
      // Use live change for preview - throttled to prevent overwhelming composition
      if (onLiveChange) {
        const now = performance.now()
        if (now - lastLiveChange >= LIVE_CHANGE_THROTTLE_MS) {
          lastLiveChange = now
          onLiveChange(newValue)
        }
      }
    }

    const handleMouseUp = () => {
      // Commit final value on mouseup
      if (scrubValue !== null) {
        onChange(scrubValue)
      }
      isScrubbing = false
      scrubValue = null
      scrubStart = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      // Blur to release focus for keyboard shortcuts
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Scroll wheel to adjust value (Shift = fine, normal = step)
  const handleWheel = (e: WheelEvent) => {
    if (disabled) return
    // Only respond when hovered, not when text-editing
    if (document.activeElement === input) return
    e.preventDefault()
    const currentValue = value === 'mixed' ? 0 : value
    const multiplier = e.shiftKey ? 0.1 : 1
    const direction = e.deltaY < 0 ? 1 : -1
    const newValue = clamp(currentValue + direction * step * multiplier)
    localValue = formatValue(newValue)
    onChange(newValue)
  }

  const isMixed = $derived(value === 'mixed')
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn(
    'relative flex items-center h-7 bg-secondary border border-input rounded-md overflow-hidden transition-colors',
    'focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
    isScrubbing && 'ring-1 ring-ring border-ring',
    disabled && 'opacity-50 cursor-not-allowed',
    !disabled && scrubEnabled && 'cursor-ew-resize',
    className,
  )}
  onmousedown={handleMouseDown}
  onwheel={handleWheel}
>
  <!-- Label prefix -->
  {#if label}
    <span class="pl-2 pr-1 text-[10px] text-muted-foreground select-none pointer-events-none">
      {label}
    </span>
  {/if}

  <!-- Input -->
  <input
    bind:this={input}
    type="text"
    autocomplete="off"
    data-bwignore="true"
    inputmode="decimal"
    bind:value={localValue}
    onblur={handleInputBlur}
    onkeydown={handleKeyDown}
    {disabled}
    placeholder={isMixed ? 'Mixed' : placeholder}
    class={cn(
      'flex-1 h-full bg-transparent text-xs font-mono tabular-nums text-foreground outline-none',
      'px-1 min-w-0 cursor-text',
      isMixed && 'italic text-muted-foreground',
    )}
  />

  <!-- Unit suffix - fixed width for alignment across different units. With
       onUnitClick it becomes the unit toggle (e.g. frames ⇄ seconds); the
       scrub handler on the wrapper must not also fire, hence stopPropagation. -->
  {#if onUnitClick}
    <button
      type="button"
      onclick={onUnitClick}
      onmousedown={(event) => event.stopPropagation()}
      {disabled}
      title={unitTitle}
      aria-label={unitTitle}
      class="pr-2 pl-1 text-[10px] text-muted-foreground select-none text-right cursor-pointer hover:text-foreground disabled:cursor-not-allowed"
      style:min-width="{unitWidth}px"
    >
      {unit}
    </button>
  {:else}
    <span
      class="pr-2 text-[10px] text-muted-foreground select-none pointer-events-none text-right"
      style:min-width="{unitWidth}px"
    >
      {unit}
    </span>
  {/if}
</div>
