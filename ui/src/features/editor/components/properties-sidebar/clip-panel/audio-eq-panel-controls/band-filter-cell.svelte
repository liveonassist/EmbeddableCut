<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import FilterTypeGlyph from './filter-type-glyph.svelte'
  import FilterTypeSelect from './filter-type-select.svelte'
  import type { FilterType } from './types'

  /** Band filter-type cell: a dropdown when the band's type is editable. */
  let {
    filterType,
    filterOptions,
    onFilterTypeChange,
    portalContainer,
  }: {
    filterType: FilterType
    filterOptions?: ReadonlyArray<FilterType>
    onFilterTypeChange?: (value: FilterType) => void
    portalContainer?: HTMLElement | null
  } = $props()
</script>

{#if filterOptions && onFilterTypeChange}
  <FilterTypeSelect
    value={filterType}
    options={filterOptions}
    onChange={onFilterTypeChange}
    {portalContainer}
  />
{:else}
  <div
    class="flex h-6 items-center rounded-[4px] border border-border bg-background px-1.5 text-muted-foreground"
  >
    <FilterTypeGlyph type={filterType} />
  </div>
{/if}
