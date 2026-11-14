<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const MAIN_SEQUENCE = '__main__'
</script>

<script lang="ts">
  /**
   * Sequence picker for the export dialog: which timeline (Main or a standalone
   * tab) the settings apply to. The caller decides whether the picker is worth
   * showing at all.
   */
  import { Label } from '@/components/ui/label'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { t } from '$lib/i18n.svelte'
  import type { ExportSequencePickerProps } from './types'

  let { options, selectedId, onSelect }: ExportSequencePickerProps = $props()
</script>

<div class="flex items-center justify-between">
  <Label for="sequence" class="text-sm font-medium">
    {t('export.settings.sequence')}
  </Label>
  <Select
    value={selectedId ?? MAIN_SEQUENCE}
    onValueChange={(value) => onSelect(value === MAIN_SEQUENCE ? null : value)}
  >
    <SelectTrigger id="sequence" class="w-[180px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {#each options as option (option.id ?? MAIN_SEQUENCE)}
        <SelectItem value={option.id ?? MAIN_SEQUENCE}>
          {option.name}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
