<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

  interface TooltipState {
    visible: boolean
    // Skip the open delay + entrance animation when another tooltip was visible
    // moments ago — moving across a toolbar should feel instant after the first.
    instant: boolean
    text: string
    x: number
    y: number
    side: TooltipSide
  }

  // How long after a tooltip hides that the next one opens instantly (no delay,
  // no animation). Matches the standard 300ms show delay.
  const INSTANT_WINDOW_MS = 300
  const SHOW_DELAY_MS = 300

  // Transform based on side for proper positioning
  const transforms: Record<TooltipSide, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  }

  // Transform origin based on side (where tooltip "points" to)
  const origins: Record<TooltipSide, string> = {
    top: 'bottom center',
    bottom: 'top center',
    left: 'right center',
    right: 'left center',
  }
</script>

<script lang="ts">
  /**
   * Global Tooltip Component
   *
   * Single instance tooltip that reads from data-tooltip attributes.
   * Much more performant than per-element Tooltip components.
   *
   * Usage: Add data-tooltip="Your tooltip text" to any element
   * Optional: data-tooltip-side="top|bottom|left|right" (default: top)
   *
   * It listens on its own root node (the editor's shadow root when embedded, or
   * the document): `mouseenter`/`mouseleave` aren't composed, so a listener on
   * the host's document never sees the editor's elements.
   */

  let tooltipState = $state<TooltipState>({
    visible: false,
    instant: false,
    text: '',
    x: 0,
    y: 0,
    side: 'top',
  })
  let tooltip = $state<HTMLDivElement | null>(null)
  let timeout: ReturnType<typeof setTimeout> | null = null
  // Timestamp of the last hide, used to decide whether the next tooltip should
  // open instantly (subsequent-hover skip-delay).
  let lastHiddenAt = 0

  function showTooltip(element: HTMLElement, instant: boolean) {
    const text = element.getAttribute('data-tooltip')
    if (!text) return

    const rect = element.getBoundingClientRect()
    const side = (element.getAttribute('data-tooltip-side') || 'top') as TooltipSide
    const sideOffset = 4 // Match Radix default sideOffset

    let x: number
    let y: number

    switch (side) {
      case 'bottom':
        x = rect.left + rect.width / 2
        y = rect.bottom + sideOffset
        break
      case 'left':
        x = rect.left - sideOffset
        y = rect.top + rect.height / 2
        break
      case 'right':
        x = rect.right + sideOffset
        y = rect.top + rect.height / 2
        break
      case 'top':
      default:
        x = rect.left + rect.width / 2
        y = rect.top - sideOffset
        break
    }

    tooltipState = { visible: true, instant, text, x, y, side }
  }

  function hideTooltip() {
    lastHiddenAt = Date.now()
    // Reset instant so the exit always fades, even if it opened instantly.
    tooltipState = { ...tooltipState, visible: false, instant: false }
  }

  function clearPending() {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
    }
  }

  function scheduleShow(target: HTMLElement) {
    // Open instantly when another tooltip was visible moments ago, otherwise
    // wait the standard delay to avoid accidental activation.
    const instant = Date.now() - lastHiddenAt < INSTANT_WINDOW_MS
    timeout = setTimeout(() => showTooltip(target, instant), instant ? 0 : SHOW_DELAY_MS)
  }

  $effect(() => {
    if (!tooltip) return
    const root = tooltip.getRootNode() as Document | ShadowRoot

    // FreeCut captures `mouseenter`/`mouseleave` on the document. Chrome doesn't
    // reliably deliver those to a shadow root's listener (an embedded editor
    // could go a whole session without a tooltip), so this delegates the
    // bubbling `pointerover`/`pointerout` instead, which it always dispatches.
    // Touch is skipped: a tap would flash the tooltip it then hides.
    const triggerOf = (node: EventTarget | null): HTMLElement | null => {
      const element =
        node instanceof Element ? node : node instanceof Node ? node.parentElement : null
      return element?.closest<HTMLElement>('[data-tooltip]') ?? null
    }

    const handlePointerOver = (e: Event) => {
      const event = e as PointerEvent
      if (event.pointerType === 'touch') return
      const target = triggerOf(event.target)
      if (!target) return

      // Moving from the button surface onto its icon is still inside the same
      // trigger and must not restart its delay or visible state.
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return

      clearPending()
      scheduleShow(target)
    }

    const handlePointerOut = (e: Event) => {
      const event = e as PointerEvent
      if (event.pointerType === 'touch') return
      const target = triggerOf(event.target)
      if (!target) return

      // Ignore movement between descendants of the same trigger.
      if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return

      clearPending()
      hideTooltip()
    }

    const handleClick = (e: Event) => {
      // Hide tooltip on any click on a tooltip element
      const eventTarget = e.target as Node
      const element =
        eventTarget?.nodeType === Node.ELEMENT_NODE
          ? (eventTarget as Element)
          : eventTarget?.parentElement

      if (!element || !element.closest('[data-tooltip]')) return

      // Clear any pending show timeout
      clearPending()
      hideTooltip()
    }

    // Capture, so a handler that stops propagation can't hide the events.
    root.addEventListener('pointerover', handlePointerOver, true)
    root.addEventListener('pointerout', handlePointerOut, true)
    root.addEventListener('click', handleClick, true)

    return () => {
      root.removeEventListener('pointerover', handlePointerOver, true)
      root.removeEventListener('pointerout', handlePointerOut, true)
      root.removeEventListener('click', handleClick, true)
      clearPending()
    }
  })
</script>

<!--
  Always render the (invisible, non-interactive) tooltip so there's always a
  hidden state to transition from — this makes both the entrance and exit
  animate, including the very first tooltip of the session.
-->
<div
  bind:this={tooltip}
  style:position="fixed"
  style:left="{tooltipState.x}px"
  style:top="{tooltipState.y}px"
  style:transform={transforms[tooltipState.side]}
  style:z-index="50"
  style:pointer-events="none"
>
  <!-- Interruptible opacity+scale transition (not a one-shot keyframe) so
       moving between adjacent triggers retargets smoothly. Origin-aware scale
       gives a subtle directional feel without a separate slide. Subsequent
       hovers snap (duration 0) via the instant flag. -->
  <div
    role="tooltip"
    aria-hidden={!tooltipState.visible}
    data-visible={tooltipState.visible}
    class="overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground opacity-0 scale-[0.97] transition-[opacity,transform] ease-out-strong data-[visible=true]:opacity-100 data-[visible=true]:scale-100"
    style:transform-origin={origins[tooltipState.side]}
    style:transition-duration={tooltipState.instant ? '0ms' : '125ms'}
  >
    {tooltipState.text}
  </div>
</div>
