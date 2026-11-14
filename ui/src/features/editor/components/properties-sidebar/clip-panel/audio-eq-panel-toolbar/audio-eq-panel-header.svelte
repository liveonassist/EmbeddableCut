<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Switch } from '@/components/ui/switch'
  import type { AudioEqPresetId } from '@/shared/utils/audio-eq'
  import EqPresetPicker from './eq-preset-picker.svelte'
  import EqResetButton from './eq-reset-button.svelte'

  interface AudioEqPanelHeaderProps {
    targetLabel: string
    eqEnabled: boolean
    presetId: AudioEqPresetId | null
    presetPlaceholder: string
    onEnabledChange?: (enabled: boolean) => void
    onPresetChange: (presetId: string) => void
    portalContainer?: HTMLElement | null
  }

  /** Title bar of the floating and detached panels. */
  let {
    targetLabel,
    eqEnabled,
    presetId,
    presetPlaceholder,
    onEnabledChange,
    onPresetChange,
    portalContainer,
  }: AudioEqPanelHeaderProps = $props()
</script>

<div class="flex items-center gap-3 border-b border-border px-3 py-2">
  {#if onEnabledChange}
    <Switch
      checked={eqEnabled}
      onCheckedChange={onEnabledChange}
      class="h-5 w-9 shrink-0 shadow-none ring-offset-0"
      aria-label="Turn {targetLabel} EQ {eqEnabled ? 'off' : 'on'}"
    />
  {:else}
    <div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
  {/if}
  <div class="text-sm font-medium text-foreground">
    Equalizer{targetLabel ? ` - ${targetLabel}` : ''}
  </div>
  <div class="ml-auto flex min-w-0 items-center gap-2">
    <div class="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Preset</div>
    <EqPresetPicker
      {presetId}
      placeholder={presetPlaceholder}
      disabled={!eqEnabled}
      {onPresetChange}
      {portalContainer}
      compact={false}
    />
    <EqResetButton disabled={!eqEnabled} onReset={() => onPresetChange('flat')} compact={false} />
  </div>
</div>
