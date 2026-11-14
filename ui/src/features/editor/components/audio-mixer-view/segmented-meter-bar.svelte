<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { SEGMENT_MASK, UNLIT_LED_BG } from './fader'

  interface SegmentedMeterBarProps {
    /** CSS height value, e.g. "42%" */
    height: string
    /** CSS bottom value for peak hold, e.g. "58%" */
    peakBottom?: string
    /** Whether the source is still scanning (unresolved waveform) */
    scanning?: boolean
    /** Additional class for the outer container */
    class?: string
    /** Optional attributes for the active fill element */
    fillProps?: Record<`data-${string}`, string | undefined>
    /** The active fill element, for imperative meter updates */
    fill?: HTMLDivElement | null
  }

  let {
    height,
    peakBottom,
    scanning,
    class: className = '',
    fillProps,
    fill = $bindable(null),
  }: SegmentedMeterBarProps = $props()
</script>

<div class="relative flex-1 rounded-[2px] bg-[#08090b] overflow-hidden {className}">
  <!-- Unlit LED backdrop -->
  <div class="absolute inset-0 pointer-events-none" style:background={UNLIT_LED_BG}></div>

  <!-- Active fill — gradient with segment mask -->
  <div
    bind:this={fill}
    {...fillProps}
    class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1be255] via-[#f5e146] to-[#ff6633] {scanning
      ? 'opacity-50'
      : ''}"
    style:height
    style:mask-image={SEGMENT_MASK}
    style:-webkit-mask-image={SEGMENT_MASK}
    style:transition="height 100ms ease-out"
  ></div>

  <!-- Peak hold — single bright segment -->
  {#if peakBottom != null}
    <div
      class="absolute inset-x-0 h-[3px] rounded-[1px] bg-white/85 shadow-[0_0_4px_rgba(255,255,255,0.5)]"
      style:bottom={peakBottom}
      style:mask-image={SEGMENT_MASK}
      style:-webkit-mask-image={SEGMENT_MASK}
      style:transition="bottom 100ms ease-out"
    ></div>
  {/if}
</div>
