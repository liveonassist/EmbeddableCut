<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { sliderInput, sliderRenders } from './timeline-header.harness'
  import type { HTMLAttributes } from 'svelte/elements'

  type Props = HTMLAttributes<HTMLSpanElement> & {
    ref?: HTMLElement | null
    value?: number[]
    onValueChange?: (value: number[]) => void
    onValueCommit?: (value: number[]) => void
    min?: number
    max?: number
    step?: number
  }

  let {
    ref = $bindable(null),
    value,
    onValueChange,
    onValueCommit,
    min: _min,
    max: _max,
    step: _step,
    class: _class,
    ...rest
  }: Props = $props()

  // One count per controlled-value render, as React's render spy.
  $effect(() => {
    void value
    sliderRenders.count++
  })

  const keyboardValue = $derived(Math.min(1, (value?.[0] ?? 0) + 0.005))
</script>

<span bind:this={ref} data-testid="zoom-slider" data-value={value?.[0]} {...rest}>
  <span>
    <span data-testid="zoom-slider-range"></span>
  </span>
  <span data-testid="zoom-slider-thumb-positioner">
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button
      type="button"
      role="slider"
      aria-valuenow={value?.[0]}
      onmousedown={() => onValueChange?.([sliderInput.value])}
      onmouseup={() => onValueCommit?.([sliderInput.value])}
      onkeydown={(event) => {
        if (event.key === 'ArrowRight') {
          onValueChange?.([keyboardValue])
        }
      }}
      onkeyup={() => onValueCommit?.([value?.[0] ?? 0])}
    ></button>
  </span>
</span>
