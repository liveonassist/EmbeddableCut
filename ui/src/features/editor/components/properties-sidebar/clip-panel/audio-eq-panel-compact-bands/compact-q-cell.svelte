<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AUDIO_EQ_Q_MAX, AUDIO_EQ_Q_MIN } from '@/shared/utils/audio-eq'
  import { NumberInput } from '../../components'
  import { bandShowsQ } from '../audio-eq-panel-bands'
  import type { CompactCellProps } from './types'

  /** Q cell of a compact row: an input for peaking types, else a gap. */
  let { view, onFieldChange, onFieldLiveChange }: CompactCellProps = $props()
</script>

{#if bandShowsQ(view.type)}
  <NumberInput
    value={view.q}
    onChange={(value) => onFieldChange(view.qField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.qField, value)}
    unit="Q"
    min={AUDIO_EQ_Q_MIN}
    max={AUDIO_EQ_Q_MAX}
    step={0.05}
  />
{:else}
  <div></div>
{/if}
