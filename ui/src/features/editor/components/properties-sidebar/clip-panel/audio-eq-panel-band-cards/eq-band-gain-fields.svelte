<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    AUDIO_EQ_GAIN_DB_MAX,
    AUDIO_EQ_GAIN_DB_MIN,
    AUDIO_EQ_Q_MAX,
    AUDIO_EQ_Q_MIN,
  } from '@/shared/utils/audio-eq'
  import { NumberInput } from '../../components'
  import RotaryKnob from '@/shared/ui/property-controls/rotary-knob.svelte'
  import { bandShowsQ } from '../audio-eq-panel-bands'
  import { GAIN_MAX_LABEL, type EqBandFieldProps } from './types'

  let { view, onFieldChange, onFieldLiveChange }: EqBandFieldProps = $props()
</script>

<div class="text-[10px] text-zinc-500">Gain</div>
<div class="flex items-center gap-1.5">
  <NumberInput
    value={view.gainDb}
    onChange={(value) => onFieldChange(view.gainField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.gainField, value)}
    unit="dB"
    min={AUDIO_EQ_GAIN_DB_MIN}
    max={AUDIO_EQ_GAIN_DB_MAX}
    step={0.1}
    class="flex-1"
  />
  <RotaryKnob
    value={view.gainDb}
    onChange={(value) => onFieldChange(view.gainField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.gainField, value)}
    min={AUDIO_EQ_GAIN_DB_MIN}
    max={AUDIO_EQ_GAIN_DB_MAX}
    step={0.1}
  />
</div>
<div class="mt-0.5 flex justify-between text-[9px] text-zinc-600">
  <span>{AUDIO_EQ_GAIN_DB_MIN} dB</span>
  <span>{GAIN_MAX_LABEL}</span>
</div>
{#if bandShowsQ(view.type)}
  <div class="text-[10px] text-zinc-500">Q Factor</div>
  <div class="flex items-center gap-1.5">
    <NumberInput
      value={view.q}
      onChange={(value) => onFieldChange(view.qField, value)}
      onLiveChange={(value) => onFieldLiveChange(view.qField, value)}
      min={AUDIO_EQ_Q_MIN}
      max={AUDIO_EQ_Q_MAX}
      step={0.05}
      class="flex-1"
    />
    <RotaryKnob
      value={view.q}
      onChange={(value) => onFieldChange(view.qField, value)}
      onLiveChange={(value) => onFieldLiveChange(view.qField, value)}
      min={AUDIO_EQ_Q_MIN}
      max={AUDIO_EQ_Q_MAX}
      step={0.05}
    />
  </div>
  <div class="mt-0.5 flex justify-between text-[9px] text-zinc-600">
    <span>{AUDIO_EQ_Q_MIN.toFixed(1)}</span>
    <span>{AUDIO_EQ_Q_MAX.toFixed(1)}</span>
  </div>
{/if}
