<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { AudioEqBandView } from '../audio-eq-panel-bands'
  import type { AudioEqControlRangeId } from '../audio-eq-ui'
  import { RangeButtons, SlopeButtons } from '../audio-eq-panel-controls'
  import EqBandGainFields from './eq-band-gain-fields.svelte'
  import type { EqBandFieldProps } from './types'

  /** Gain, Q and Q-slope region, or the cut-slope buttons the cut types use. */
  let {
    view,
    onFieldChange,
    onFieldLiveChange,
    onRangeChange,
  }: EqBandFieldProps & {
    onRangeChange: (view: AudioEqBandView, rangeId: AudioEqControlRangeId) => void
  } = $props()

  const slope = $derived(view.slope)
</script>

{#if !view.hidden}
  {#if slope}
    <SlopeButtons value={slope.value} onChange={(value) => onFieldChange(slope.field, value)} />
  {:else}
    {#if view.rangeId}
      <RangeButtons value={view.rangeId} onChange={(rangeId) => onRangeChange(view, rangeId)} />
    {/if}
    <EqBandGainFields {view} {onFieldChange} {onFieldLiveChange} />
  {/if}
{/if}
