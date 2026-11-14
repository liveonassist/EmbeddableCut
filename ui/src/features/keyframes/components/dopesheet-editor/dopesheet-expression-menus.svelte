<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { ExpressionPresetGroup } from './dopesheet-expression-catalog'

  const PRESET_GROUPS: readonly ExpressionPresetGroup[] = ['Adjust', 'Motion', 'Timing']
</script>

<script lang="ts">
  import type { DirectLinkableProperty } from '@/types/keyframe'
  import { getExpressionPresets } from './dopesheet-expression-catalog'

  interface DopesheetExpressionPresetsMenuProps {
    property: DirectLinkableProperty
    onSelect: (source: string) => void
  }

  let { property, onSelect }: DopesheetExpressionPresetsMenuProps = $props()

  const presets = $derived(getExpressionPresets(property))
</script>

<select
  aria-label="Expression presets"
  class="h-7 max-w-32 rounded-md border border-border bg-background px-2 text-[10px] text-muted-foreground outline-none hover:text-foreground focus:border-ring"
  onchange={(event) => {
    onSelect(event.currentTarget.value)
    event.currentTarget.value = ''
  }}
>
  <option value="" disabled selected>Presets…</option>
  {#each PRESET_GROUPS as group (group)}
    {@const groupedPresets = presets.filter((preset) => preset.group === group)}
    {#if groupedPresets.length > 0}
      <optgroup label={group}>
        {#each groupedPresets as preset (preset.label)}
          <option value={preset.source} title={preset.description}>{preset.label}</option>
        {/each}
      </optgroup>
    {/if}
  {/each}
</select>
