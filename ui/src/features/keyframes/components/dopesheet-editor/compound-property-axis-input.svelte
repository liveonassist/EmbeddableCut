<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const AXIS_SCRUB_DRAG_THRESHOLD = 2

  /** The focused element in the input's own root, so a shadow-root editor sees its inputs. */
  function getActiveElement(node: Element | null): Element | null {
    const root = node?.getRootNode() as Document | ShadowRoot | undefined
    return root?.activeElement ?? document.activeElement
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { setPointerCaptureSafely } from './dopesheet-utils'
  import { getScrubbedPropertyValue } from './property-value-scrub'

  interface AxisInputProps {
    axis: 'x' | 'y'
    value: number
    unit: string
    propertyLabel: string
    showAxisLabel: boolean
    disabled: boolean
    allowCreateOnBlur: boolean
    onCommit: (value: number, options: { allowCreate: boolean }) => boolean | void
    onScrubStart?: () => void
    onScrubPreview?: (value: number) => void
    onScrubEnd?: (value: number) => void
    onScrubCancel?: () => void
    scrubStep?: number
    decimals?: number
  }

  let {
    axis,
    value,
    unit,
    propertyLabel,
    showAxisLabel,
    disabled,
    allowCreateOnBlur,
    onCommit,
    onScrubStart,
    onScrubPreview,
    onScrubEnd,
    onScrubCancel,
    scrubStep,
    decimals = 2,
  }: AxisInputProps = $props()

  let input: HTMLInputElement | null = null
  let skipNextBlurCommit = false
  let draft = $state(untrack(() => value.toFixed(decimals)))
  let scrub: {
    pointerId: number
    startX: number
    startValue: number
    lastValue: number
    didDrag: boolean
  } | null = null

  $effect(() => {
    const next = value.toFixed(decimals)
    if (getActiveElement(input) !== input) draft = next
  })

  const commit = (allowCreate: boolean) => {
    const parsed = Number(draft)
    if (Number.isFinite(parsed)) {
      const quantized = Number(parsed.toFixed(decimals))
      if (quantized !== value) {
        const applied = onCommit(quantized, { allowCreate })
        if (applied === false) draft = value.toFixed(decimals)
        else draft = quantized.toFixed(decimals)
      }
    } else draft = value.toFixed(decimals)
  }

  const handleDraftInput = (event: Event & { currentTarget: HTMLInputElement }) => {
    draft = event.currentTarget.value
  }
</script>

<label
  class="flex h-5 min-w-0 flex-1 items-center bg-background/85 px-1 text-[9px] {axis === 'y'
    ? 'border-l border-border/70'
    : ''}"
>
  {#if showAxisLabel}
    <span class="mr-1 text-muted-foreground">{axis.toUpperCase()}</span>
  {/if}
  <!-- Timeline parameter fields are never credentials. Keep password-manager
       overlays from rescanning this dense surface on every playback mutation. -->
  <input
    bind:this={input}
    aria-label="{propertyLabel} {axis.toUpperCase()}"
    autocomplete="off"
    class="min-w-0 flex-1 cursor-ew-resize select-none bg-transparent text-right font-mono text-[9px] tabular-nums outline-none disabled:cursor-default disabled:opacity-50"
    data-bwignore="true"
    {disabled}
    inputmode="decimal"
    value={draft}
    oninput={handleDraftInput}
    onchange={handleDraftInput}
    onpointerdown={(event) => {
      if (event.button !== 0 || disabled) return
      const startValue = Number(draft)
      if (!Number.isFinite(startValue)) return
      scrub = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue,
        lastValue: startValue,
        didDrag: false,
      }
      setPointerCaptureSafely(event.currentTarget, event.pointerId)
    }}
    onpointermove={(event) => {
      const active = scrub
      if (!active || active.pointerId !== event.pointerId) return
      const deltaX = event.clientX - active.startX
      if (!active.didDrag && Math.abs(deltaX) < AXIS_SCRUB_DRAG_THRESHOLD) return
      if (!active.didDrag) {
        active.didDrag = true
        onScrubStart?.()
      }
      event.preventDefault()
      const next = getScrubbedPropertyValue({
        startValue: active.startValue,
        deltaX,
        decimals,
        step: scrubStep,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      })
      active.lastValue = next.value
      draft = next.display
      onScrubPreview?.(next.value)
    }}
    onpointerup={(event) => {
      const active = scrub
      if (!active || active.pointerId !== event.pointerId) return
      scrub = null
      if (!active.didDrag) return
      event.preventDefault()
      if (onScrubEnd) onScrubEnd(active.lastValue)
      else onCommit(active.lastValue, { allowCreate: true })
    }}
    onpointercancel={(event) => {
      const active = scrub
      if (!active || active.pointerId !== event.pointerId) return
      scrub = null
      if (!active.didDrag) return
      event.preventDefault()
      draft = active.startValue.toFixed(decimals)
      onScrubCancel?.()
    }}
    onblur={() => {
      if (skipNextBlurCommit) {
        skipNextBlurCommit = false
        return
      }
      commit(allowCreateOnBlur)
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        skipNextBlurCommit = true
        commit(true)
        event.currentTarget.blur()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        skipNextBlurCommit = true
        draft = value.toFixed(decimals)
        event.currentTarget.blur()
      }
    }}
  />
  <span class="ml-0.5 text-muted-foreground">{unit}</span>
</label>
