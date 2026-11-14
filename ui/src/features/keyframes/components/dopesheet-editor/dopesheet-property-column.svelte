<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * The graph pane's property column (React's `propertyColumnElements`): each
   * group's header (unless inline) followed by its rows while it is open.
   */
  import { GROUP_HEADER_HEIGHT, ROW_HEIGHT } from './dopesheet-constants'
  import { DopesheetGroupHeader, DopesheetPropertyRowContent } from './dopesheet-row-renderers'
  import type { DopesheetPropertyColumnProps } from './use-dopesheet-sheet-rows'

  let {
    rowContentProps,
    groupHeaderProps,
    groupedPropertyRows,
    expandedGroups,
    inlinePropertyGroupIdSet,
  }: DopesheetPropertyColumnProps = $props()
</script>

{#snippet propertyRows(group: (typeof groupedPropertyRows)[number], inline: boolean)}
  {#each group.rows as row (row.property)}
    <div class="border-b border-border/60" style:height="{ROW_HEIGHT}px">
      <DopesheetPropertyRowContent {row} options={{ indented: !inline }} {...rowContentProps} />
    </div>
  {/each}
{/snippet}

{#each groupedPropertyRows as group (group.id)}
  {#if inlinePropertyGroupIdSet.has(group.id)}
    {@render propertyRows(group, true)}
  {:else}
    <div class="border-b border-border/60" style:height="{GROUP_HEADER_HEIGHT}px">
      <DopesheetGroupHeader {group} {...groupHeaderProps} />
    </div>
    {#if expandedGroups[group.id] ?? true}
      {@render propertyRows(group, false)}
    {/if}
  {/if}
{/each}
