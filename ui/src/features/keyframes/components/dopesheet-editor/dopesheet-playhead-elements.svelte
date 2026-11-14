<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import DopesheetPlayheadOverlay from './dopesheet-playhead-overlays.svelte'
  import {
    hasDopesheetPlayheadElement,
    type DopesheetPlayheadElementPart,
    type DopesheetPlayheadElementsProps,
  } from './dopesheet-playhead-elements'

  /**
   * One of the three playhead overlays built from one geometry bundle. The
   * exclusive (`dopesheet`/`graph`) and `split` shells place them differently,
   * so each placement renders its own `part`.
   */
  let {
    part,
    showPlayhead,
    skim,
    playheadFrame,
    ...overlay
  }: DopesheetPlayheadElementsProps & { part: DopesheetPlayheadElementPart } = $props()
</script>

{#if hasDopesheetPlayheadElement(part, { showPlayhead, skim })}
  <DopesheetPlayheadOverlay
    variant={part}
    playheadFrame={part === 'skim' ? undefined : playheadFrame}
    {...overlay}
    followPreviewFrame={!skim}
  />
{/if}
