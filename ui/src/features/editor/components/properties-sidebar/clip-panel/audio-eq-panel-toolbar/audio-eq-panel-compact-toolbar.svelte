<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Switch } from '@/components/ui/switch'
  import type { AudioEqPresetId } from '@/shared/utils/audio-eq'
  import EqPresetPicker from './eq-preset-picker.svelte'
  import EqResetButton from './eq-reset-button.svelte'

  interface AudioEqPanelCompactToolbarProps {
    clipEqEnabled: boolean
    presetId: AudioEqPresetId | null
    presetPlaceholder: string
    onClipEqEnabledChange: (enabled: boolean) => void
    onPresetChange: (presetId: string) => void
    portalContainer?: HTMLElement | null
  }

  /** Clip EQ switch, preset picker and reset, as used inside clip panels. */
  let {
    clipEqEnabled,
    presetId,
    presetPlaceholder,
    onClipEqEnabledChange,
    onPresetChange,
    portalContainer,
  }: AudioEqPanelCompactToolbarProps = $props()
</script>

<div class="flex items-center gap-1.5 px-2 pt-2 pb-1">
  <Switch
    checked={clipEqEnabled}
    onCheckedChange={onClipEqEnabledChange}
    class="shrink-0"
    aria-label="Turn clip EQ {clipEqEnabled ? 'off' : 'on'}"
  />
  <EqPresetPicker
    {presetId}
    placeholder={presetPlaceholder}
    disabled={!clipEqEnabled}
    {onPresetChange}
    {portalContainer}
    compact
  />
  <EqResetButton disabled={!clipEqEnabled} onReset={() => onPresetChange('flat')} compact />
</div>
