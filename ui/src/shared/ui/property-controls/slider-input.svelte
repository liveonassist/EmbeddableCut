<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  type MixedValue = number | 'mixed'

  const LIVE_CHANGE_THROTTLE_MS = 16 // ~60fps max
  const CLICK_THRESHOLD = 3 // px — distinguishes click from drag
  const SNAP_TOLERANCE = 0.03125 // 1/32 — magnetic snap to deciles
  const MAX_STRETCH = 6 // px — max rubber-band overflow
  const DEAD_ZONE = 24 // px — distance past edge before rubber-band starts
  const MAX_CURSOR_RANGE = 160 // px — cursor distance at max stretch

  interface SliderInputProps {
    value: MixedValue
    /** Called on final commit (mouse up). Updates the actual value. */
    onChange: (value: number) => void
    /** Called during drag for live preview. If not provided, onChange is used. */
    onLiveChange?: (value: number) => void
    /** Optional throttle for live preview updates during drag. Set to 0 for every pointer move. */
    liveChangeThrottleMs?: number
    label?: string
    min: number
    max: number
    step?: number
    unit?: string
    formatValue?: (value: number) => string
    formatInputValue?: (value: number) => string
    parseInputValue?: (rawValue: string) => number
    disabled?: boolean
    class?: string
  }

  function decimalsForStep(step: number): number {
    const s = step.toString()
    const dot = s.indexOf('.')
    return dot === -1 ? 0 : s.length - dot - 1
  }

  function roundToStep(val: number, step: number): number {
    const raw = Math.round(val / step) * step
    return parseFloat(raw.toFixed(decimalsForStep(step)))
  }

  function snapToDecile(rawValue: number, min: number, max: number): number {
    const normalized = (rawValue - min) / (max - min)
    const nearest = Math.round(normalized * 10) / 10
    if (Math.abs(normalized - nearest) <= SNAP_TOLERANCE) {
      return min + nearest * (max - min)
    }
    return rawValue
  }

  /** Simple spring animation using rAF */
  function animateSpring(
    from: number,
    to: number,
    onUpdate: (value: number) => void,
    onComplete?: () => void,
  ): () => void {
    let velocity = 0
    let current = from
    const stiffness = 300
    const damping = 25
    const mass = 0.8
    let rafId: number | null = null
    let lastTime = performance.now()

    function tick(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.032)
      lastTime = now

      const displacement = current - to
      const springForce = -stiffness * displacement
      const dampingForce = -damping * velocity
      const acceleration = (springForce + dampingForce) / mass

      velocity += acceleration * dt
      current += velocity * dt

      onUpdate(current)

      if (Math.abs(displacement) < 0.01 && Math.abs(velocity) < 0.1) {
        onUpdate(to)
        onComplete?.()
        return
      }

      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }

  /**
   * Set an element's only text without replacing the text node Svelte renders
   * into, so a later template update still lands (React set `textContent`).
   */
  function setText(node: HTMLElement, text: string): void {
    const first = node.firstChild
    if (first && first === node.lastChild && first.nodeType === Node.TEXT_NODE) {
      first.nodeValue = text
    } else {
      node.textContent = text
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { cn } from '@/shared/ui/cn'

  /**
   * DialKit-inspired slider with:
   * - Label + value inline inside the track
   * - Click-to-snap with spring animation
   * - Rubber-band overflow when dragging past bounds
   * - Smart magnetic snapping to deciles on click
   * - Handle dodge (fades when overlapping text)
   * - Click value or double-click track to type exact value
   * - Hash marks at decile intervals
   */
  let {
    value,
    onChange,
    onLiveChange,
    liveChangeThrottleMs = LIVE_CHANGE_THROTTLE_MS,
    label,
    min,
    max,
    step = 1,
    unit,
    formatValue: formatValueProp,
    formatInputValue,
    parseInputValue,
    disabled = false,
    class: className,
  }: SliderInputProps = $props()

  const isMixed = $derived(value === 'mixed')
  const numericValue = $derived(value === 'mixed' ? (min + max) / 2 : value)

  // Elements
  let track: HTMLDivElement | null = null
  let fill: HTMLDivElement | null = null
  let handle: HTMLDivElement | null = null
  let labelSpan: HTMLSpanElement | null = $state(null)
  let valueSpan: HTMLSpanElement | null = $state(null)
  let input: HTMLInputElement | null = $state(null)

  // Imperative values (React refs)
  let lastLiveChange = 0
  let pointerDownPos: { x: number; y: number } | null = null
  let isClick = true
  let rect: DOMRect | null = null
  let cancelSpring: (() => void) | null = null
  // Plain value for the input text to avoid stale reads in blur handlers
  let inputValueRef = ''

  // State
  const initialFillPercent = untrack(() => ((numericValue - min) / (max - min)) * 100)
  let fillPercent = $state(initialFillPercent)
  let rubberStretch = $state(0)
  let isInteracting = $state(false)
  let isDragging = $state(false)
  let isHovered = $state(false)
  let showInput = $state(false)
  let inputValue = $state('')
  let localValue = $state<number | null>(null)
  let previousNumericValue = untrack(() => numericValue)

  let showInputRef = false
  let isSubmitting = false
  let cancelEdit = false
  let fillPercentRef = initialFillPercent
  let rubberStretchRef = 0
  let localValueRef: number | null = null

  const displayNumericValue = $derived(localValue ?? numericValue)

  // Sync fill from props when not interacting and no spring is running
  $effect(() => {
    const n = numericValue
    const lo = min
    const hi = max
    const interacting = isInteracting
    if (!interacting && !cancelSpring) {
      const nextFillPercent = ((n - lo) / (hi - lo)) * 100
      fillPercentRef = nextFillPercent
      fillPercent = nextFillPercent
    }
  })

  $effect(() => {
    const n = numericValue
    const local = localValue
    const interacting = isInteracting
    const editing = showInput
    const previous = previousNumericValue
    previousNumericValue = n

    if (editing || interacting || local === null) {
      return
    }

    if (n === local || n !== previous) {
      localValue = null
    }
  })

  const formatDisplay = (v: number) => {
    if (formatValueProp) return formatValueProp(v)
    const formatted = v.toFixed(decimalsForStep(step))
    return unit ? `${formatted}${unit}` : formatted
  }

  const displayValue = $derived(
    isMixed && localValue === null ? 'Mixed' : formatDisplay(displayNumericValue),
  )

  const updateDisplayedValue = (nextLocalValue: number | null) => {
    localValueRef = nextLocalValue
    if (showInputRef || !valueSpan) return

    setText(
      valueSpan,
      isMixed && nextLocalValue === null ? 'Mixed' : formatDisplay(nextLocalValue ?? numericValue),
    )
  }

  const updateStretchVisual = (nextStretch: number) => {
    rubberStretchRef = nextStretch
    if (!track) return

    const stretchWidth = Math.abs(nextStretch)
    const stretchX = nextStretch < 0 ? nextStretch : 0
    track.style.width = stretchWidth > 0 ? `calc(100% + ${stretchWidth}px)` : ''
    track.style.transform = stretchX !== 0 ? `translateX(${stretchX}px)` : ''
  }

  const updateFillVisual = (
    nextFillPercent: number,
    options?: {
      active?: boolean
      dragging?: boolean
    },
  ) => {
    fillPercentRef = nextFillPercent
    const clampedFillPercent = Math.max(0, Math.min(100, nextFillPercent))

    if (fill) {
      fill.style.width = `${clampedFillPercent}%`
    }

    if (!handle) return

    const isActiveNow = options?.active ?? (isInteracting || isHovered)
    const isDraggingNow = options?.dragging ?? isDragging
    let valueDodge = false

    // Inactive sliders hide their handle, so measuring label/value overlap is
    // wasted work. offsetWidth would also force layout when an unrelated
    // property update rerenders a large inspector.
    if (isActiveNow) {
      const trackWidth = track?.offsetWidth ?? 200
      const labelWidth = labelSpan?.offsetWidth ?? 30
      const valueWidth = valueSpan?.offsetWidth ?? 40
      const handleBuffer = 8
      const leftThreshold = ((8 + labelWidth + handleBuffer) / trackWidth) * 100
      const rightThreshold = ((trackWidth - 8 - valueWidth - handleBuffer) / trackWidth) * 100
      valueDodge = nextFillPercent < leftThreshold || nextFillPercent > rightThreshold
    }
    const handleOpacity = !isActiveNow ? 0 : valueDodge ? 0.1 : isDraggingNow ? 0.9 : 0.5

    handle.style.left = `max(4px, calc(${clampedFillPercent}% - 1.5px))`
    handle.style.transform = `translateY(-50%) scaleX(${isActiveNow ? 1 : 0.25}) scaleY(${isActiveNow && valueDodge ? 0.75 : 1})`
    handle.style.opacity = String(handleOpacity)
  }

  $effect(() => {
    const local = localValue
    const interacting = isInteracting
    // The displayed text also depends on how it's formatted.
    void [formatValueProp, step, unit, isMixed, numericValue, valueSpan]
    untrack(() => {
      localValueRef = local
      if (!interacting) {
        updateDisplayedValue(local)
      }
    })
  })

  $effect(() => {
    const percent = fillPercent
    const dragging = isDragging
    const hovered = isHovered
    const interacting = isInteracting
    untrack(() => {
      if (interacting) {
        updateFillVisual(fillPercentRef, { active: true, dragging })
      } else {
        fillPercentRef = percent
        updateFillVisual(percent, { active: hovered, dragging: false })
      }
    })
  })

  $effect(() => {
    const stretch = rubberStretch
    const interacting = isInteracting
    untrack(() => {
      rubberStretchRef = stretch
      if (!interacting) {
        updateStretchVisual(stretch)
      }
    })
  })

  const positionToValue = (clientX: number) => {
    if (!rect) return numericValue
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.max(min, Math.min(max, min + percent * (max - min)))
  }

  const computeRubberStretch = (clientX: number, sign: number) => {
    if (!rect) return 0
    const distancePast = sign < 0 ? rect.left - clientX : clientX - rect.right
    const overflow = Math.max(0, distancePast - DEAD_ZONE)
    return sign * MAX_STRETCH * Math.sqrt(Math.min(overflow / MAX_CURSOR_RANGE, 1.0))
  }

  const emitLiveChange = (newValue: number) => {
    const handler = onLiveChange ?? onChange
    if (liveChangeThrottleMs <= 0) {
      handler(newValue)
      return
    }
    const now = performance.now()
    if (now - lastLiveChange >= liveChangeThrottleMs) {
      lastLiveChange = now
      handler(newValue)
    }
  }

  const openTextInput = () => {
    const raw = formatInputValue
      ? formatInputValue(numericValue)
      : numericValue.toFixed(decimalsForStep(step))
    cancelEdit = false
    showInput = true
    showInputRef = true
    inputValue = raw
    inputValueRef = raw
  }

  const commitTextInput = () => {
    if (isSubmitting || cancelEdit) {
      cancelEdit = false
      return
    }
    isSubmitting = true

    const raw = inputValueRef
    const parsed = parseInputValue ? parseInputValue(raw) : parseFloat(raw)
    if (!isNaN(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed))
      const rounded = roundToStep(clamped, step)
      const nextFillPercent = ((rounded - min) / (max - min)) * 100
      fillPercentRef = nextFillPercent
      localValueRef = rounded
      fillPercent = nextFillPercent
      localValue = rounded
      onChange(rounded)
    }

    showInput = false
    showInputRef = false

    queueMicrotask(() => {
      isSubmitting = false
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    })
  }

  const handlePointerDown = (e: PointerEvent) => {
    if (showInputRef || disabled) return

    // Let clicks on the value span through for direct click-to-edit
    if (valueSpan && valueSpan.contains(e.target as Node)) {
      return
    }

    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointerDownPos = { x: e.clientX, y: e.clientY }
    isClick = true
    localValueRef = null
    isInteracting = true

    if (track) {
      rect = track.getBoundingClientRect()
    }

    if (cancelSpring) {
      cancelSpring()
      cancelSpring = null
    }
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (!isInteracting || !pointerDownPos) return

    const dx = e.clientX - pointerDownPos.x
    const dy = e.clientY - pointerDownPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (isClick && distance > CLICK_THRESHOLD) {
      isClick = false
      isDragging = true
    }

    if (!isClick) {
      let nextStretch = 0
      if (rect) {
        if (e.clientX < rect.left) {
          nextStretch = computeRubberStretch(e.clientX, -1)
        } else if (e.clientX > rect.right) {
          nextStretch = computeRubberStretch(e.clientX, 1)
        }
      }
      updateStretchVisual(nextStretch)

      const newValue = positionToValue(e.clientX)
      const rounded = roundToStep(newValue, step)
      const pct = ((rounded - min) / (max - min)) * 100
      localValueRef = rounded
      updateFillVisual(pct, { active: true, dragging: true })
      updateDisplayedValue(rounded)
      emitLiveChange(rounded)
    }
  }

  const handlePointerUp = (e: PointerEvent) => {
    if (!isInteracting) return

    // If text input is open (e.g. from double-click), don't snap or blur
    if (showInputRef) {
      isInteracting = false
      isDragging = false
      pointerDownPos = null
      return
    }

    if (isClick) {
      const rawValue = positionToValue(e.clientX)
      const discreteSteps = (max - min) / step
      const snappedValue =
        discreteSteps <= 10
          ? Math.max(min, Math.min(max, min + Math.round((rawValue - min) / step) * step))
          : roundToStep(snapToDecile(rawValue, min, max), step)

      const targetPct = ((snappedValue - min) / (max - min)) * 100
      const currentPct = fillPercentRef

      cancelSpring = animateSpring(
        currentPct,
        targetPct,
        (pct) => updateFillVisual(pct, { active: true, dragging: false }),
        () => {
          cancelSpring = null
          fillPercent = targetPct
        },
      )

      localValueRef = snappedValue
      localValue = snappedValue
      onChange(roundToStep(snappedValue, step))
    } else {
      if (localValueRef !== null) {
        fillPercent = fillPercentRef
        localValue = localValueRef
        onChange(localValueRef)
      }
    }

    if (rubberStretchRef !== 0) {
      const startStretch = rubberStretchRef
      rubberStretch = startStretch
      animateSpring(
        startStretch,
        0,
        (v) => updateStretchVisual(v),
        () => {
          updateStretchVisual(0)
          rubberStretch = 0
        },
      )
    }

    isInteracting = false
    isDragging = false
    pointerDownPos = null

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  // Focus input when it appears
  $effect(() => {
    if (showInput && input) {
      input.focus()
      input.select()
    }
  })

  // Click on value span → open text input immediately
  const handleValueClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    openTextInput()
  }

  // Double-click anywhere on track → open text input
  const handleDoubleClick = (e: MouseEvent) => {
    if (showInputRef || disabled) return
    e.preventDefault()
    openTextInput()
  }

  const handleInputKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      commitTextInput()
    } else if (e.key === 'Escape') {
      cancelEdit = true
      showInput = false
      showInputRef = false
    }
  }

  const handleInputChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    inputValue = e.currentTarget.value
    inputValueRef = e.currentTarget.value
  }

  // Handle dodge — fade handle when it overlaps label or value
  const isActive = $derived(isInteracting || isHovered)
  // Accurate overlap styling is applied imperatively by updateFillVisual after
  // render; the first paint uses the inactive handle.
  const initialHandleOpacity = 0

  // Hash marks — decile tick marks
  const hashMarks = $derived.by(() => {
    const discreteSteps = (max - min) / step
    return discreteSteps <= 10
      ? Array.from(
          { length: Math.max(0, discreteSteps - 1) },
          (_, i) => (((i + 1) * step) / (max - min)) * 100,
        )
      : [10, 20, 30, 40, 50, 60, 70, 80, 90]
  })

  const stretchWidth = $derived(Math.abs(rubberStretch))
  const stretchX = $derived(rubberStretch < 0 ? rubberStretch : 0)
  const initialFillWidth = Math.max(0, Math.min(100, initialFillPercent))
</script>

<div class={cn('min-w-0 flex-1', className)}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={track}
    class={cn(
      'relative flex items-center h-7 rounded-md overflow-hidden select-none touch-none',
      'bg-secondary border border-input',
      'transition-colors duration-150',
      isActive && 'border-ring/50',
      isDragging && 'border-ring',
      disabled && 'opacity-50 pointer-events-none',
      !disabled && 'cursor-pointer',
    )}
    style:width={stretchWidth > 0 ? `calc(100% + ${stretchWidth}px)` : undefined}
    style:transform={stretchX !== 0 ? `translateX(${stretchX}px)` : undefined}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    ondblclick={handleDoubleClick}
    onmouseenter={() => (isHovered = true)}
    onmouseleave={() => (isHovered = false)}
  >
    <!-- Hash marks -->
    <div class="absolute inset-0 pointer-events-none">
      {#each hashMarks as pct (pct)}
        <div
          class={cn(
            'absolute top-1/2 -translate-y-1/2 w-px h-2 rounded-full',
            'transition-opacity duration-150',
            isActive ? 'bg-foreground/15' : 'bg-foreground/8',
          )}
          style:left="{pct}%"
        ></div>
      {/each}
    </div>

    <!-- Fill: width is driven imperatively after the first paint -->
    <div
      bind:this={fill}
      class={cn('absolute inset-y-0 left-0 rounded-md', 'transition-colors duration-150')}
      style="width: {initialFillWidth}%"
      style:background={isActive ? 'hsl(var(--foreground) / 0.12)' : 'hsl(var(--foreground) / 0.08)'}
    ></div>

    <!-- Handle: position, scale and opacity are driven imperatively -->
    <div
      bind:this={handle}
      class="absolute top-1/2 w-[3px] h-3.5 rounded-full bg-foreground/90 pointer-events-none"
      style="left: max(4px, calc({initialFillWidth}% - 1.5px)); transform: translateY(-50%) scaleX(0.25) scaleY(1); opacity: {initialHandleOpacity}; transition: opacity 150ms, transform 200ms var(--ease-out-strong)"
    ></div>

    <!-- Label (left) -->
    {#if label}
      <span
        bind:this={labelSpan}
        class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none"
      >
        {label}
      </span>
    {/if}

    <!-- Value (right) — click to edit -->
    {#if showInput}
      <input
        bind:this={input}
        type="text"
        autocomplete="off"
        data-bwignore="true"
        inputmode="decimal"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 w-14 h-5 text-xs font-mono tabular-nums text-foreground text-right bg-background/80 border border-ring rounded px-1 outline-none"
        value={inputValue}
        oninput={handleInputChange}
        onkeydown={handleInputKeyDown}
        onblur={commitTextInput}
        onclick={(e) => e.stopPropagation()}
        onpointerdown={(e) => e.stopPropagation()}
      />
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        bind:this={valueSpan}
        class={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono tabular-nums cursor-text',
          'text-muted-foreground hover:text-foreground transition-colors duration-150',
          isMixed && localValue === null && 'italic opacity-50',
        )}
        onclick={handleValueClick}
        onpointerdown={(e) => e.stopPropagation()}>{displayValue}</span
      >
    {/if}
  </div>
</div>
