<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AUDIO_EQ_GAIN_DB_MAX, AUDIO_EQ_GAIN_DB_MIN } from '@/shared/utils/audio-eq'
  import { NumberInput } from '../../components'
  import { bandShowsGain } from '../audio-eq-panel-bands'
  import type { CompactCellProps } from './types'

  /** Gain cell of a compact row: an input for gain-carrying types, else a gap. */
  let { view, onFieldChange, onFieldLiveChange }: CompactCellProps = $props()
</script>

{#if bandShowsGain(view.type)}
  <NumberInput
    value={view.gainDb}
    onChange={(value) => onFieldChange(view.gainField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.gainField, value)}
    unit="dB"
    min={AUDIO_EQ_GAIN_DB_MIN}
    max={AUDIO_EQ_GAIN_DB_MAX}
    step={0.1}
  />
{:else}
  <div></div>
{/if}
