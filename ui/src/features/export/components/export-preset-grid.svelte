<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Quick presets for the export dialog: one-click container/codec/quality/
   * resolution targets, with the active one marked and "Custom" shown otherwise.
   */
  import { Label } from '@/components/ui/label'
  import { t } from '$lib/i18n.svelte'
  import type { ExportPresetGridProps } from './types'

  let { presets, activePresetId, onApplyPreset }: ExportPresetGridProps = $props()
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <Label>{t('export.settings.presetLabel')}</Label>
    {#if activePresetId === null}
      <span class="text-xs text-muted-foreground">{t('export.settings.presetCustom')}</span>
    {/if}
  </div>
  <div class="grid grid-cols-2 gap-2">
    {#each presets as preset (preset.id)}
      {@const isActive = activePresetId === preset.id}
      <button
        type="button"
        onclick={() => onApplyPreset(preset)}
        aria-pressed={isActive}
        class="rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors {isActive
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/50 hover:text-foreground'}"
      >
        {t(preset.labelKey)}
      </button>
    {/each}
  </div>
</div>
