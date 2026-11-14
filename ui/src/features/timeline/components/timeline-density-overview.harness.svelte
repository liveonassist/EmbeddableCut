<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import TimelineDensityOverview from './timeline-density-overview.svelte'

  let {
    items,
    selectedItemIds = new Set<string>(),
    onNativeClick,
  }: {
    items: TimelineItem[]
    selectedItemIds?: ReadonlySet<string>
    onNativeClick?: () => void
  } = $props()
</script>

<TimelineDensityOverview {items} {selectedItemIds} trackLocked={false} trackHidden={false} />
{#if onNativeClick}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div data-timeline-item data-item-id="overview-1" onclick={onNativeClick}></div>
{/if}
