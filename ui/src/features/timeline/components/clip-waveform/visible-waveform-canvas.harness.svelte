<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import VisibleWaveformCanvas from './visible-waveform-canvas.svelte'

  type CanvasProps = ComponentProps<typeof VisibleWaveformCanvas>

  let {
    timelineItem = null,
    itemStyle,
    nested = false,
    ...canvasProps
  }: CanvasProps & {
    /** `data-*` attributes of a wrapping timeline item inside a scroll container. */
    timelineItem?: Record<string, string> | null
    itemStyle?: string
    /** Put the canvas host one element below the timeline item. */
    nested?: boolean
  } = $props()
</script>

{#if timelineItem}
  <div data-timeline-scroll-container>
    <div data-timeline-item {...timelineItem} style={itemStyle}>
      {#if nested}
        <div>
          <VisibleWaveformCanvas {...canvasProps} />
        </div>
      {:else}
        <VisibleWaveformCanvas {...canvasProps} />
      {/if}
    </div>
  </div>
{:else}
  <VisibleWaveformCanvas {...canvasProps} />
{/if}
