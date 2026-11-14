<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { NumberInput } from '../../components'
  import RotaryKnob from '@/shared/ui/property-controls/rotary-knob.svelte'
  import { formatFrequencyRangeLabel } from '../audio-eq-panel-values'
  import type { EqBandFieldProps } from './types'

  let { view, onFieldChange, onFieldLiveChange }: EqBandFieldProps = $props()
</script>

<div class="text-[10px] text-zinc-500">Frequency</div>
<div class="flex items-center gap-1.5">
  <NumberInput
    value={view.frequencyHz}
    onChange={(value) => onFieldChange(view.frequencyField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.frequencyField, value)}
    unit="Hz"
    min={view.minFrequencyHz}
    max={view.maxFrequencyHz}
    step={1}
    class="flex-1"
  />
  <RotaryKnob
    value={view.frequencyHz}
    onChange={(value) => onFieldChange(view.frequencyField, value)}
    onLiveChange={(value) => onFieldLiveChange(view.frequencyField, value)}
    min={view.minFrequencyHz}
    max={view.maxFrequencyHz}
    step={1}
  />
</div>
<div class="mt-0.5 flex justify-between text-[9px] text-zinc-600">
  <span>{formatFrequencyRangeLabel(view.minFrequencyHz)}</span>
  <span>{formatFrequencyRangeLabel(view.maxFrequencyHz)}</span>
</div>
