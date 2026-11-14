<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import { cn } from '@/shared/ui/cn'
  import { AUDIO_EQ_PRESETS, type AudioEqPresetId } from '@/shared/utils/audio-eq'

  interface EqPresetPickerProps {
    presetId: AudioEqPresetId | null
    placeholder: string
    disabled: boolean
    onPresetChange: (presetId: string) => void
    portalContainer?: HTMLElement | null
    compact: boolean
  }

  /** Preset dropdown shared by the floating header and the compact toolbar. */
  let {
    presetId,
    placeholder,
    disabled,
    onPresetChange,
    portalContainer,
    compact,
  }: EqPresetPickerProps = $props()
</script>

<Select value={presetId ?? undefined} onValueChange={onPresetChange} {disabled}>
  <SelectTrigger
    class={cn(
      compact
        ? 'h-7 flex-1 min-w-0 text-xs'
        : 'h-8 w-[220px] border-border bg-secondary/30 text-xs text-foreground',
      disabled && 'opacity-40',
    )}
  >
    <SelectValue {placeholder} />
  </SelectTrigger>
  <SelectContent container={portalContainer ?? undefined}>
    {#each AUDIO_EQ_PRESETS as preset (preset.id)}
      <SelectItem value={preset.id} class="text-xs">
        {preset.label}
      </SelectItem>
    {/each}
  </SelectContent>
</Select>
