<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useStagedTimelineDetailIds } from './use-staged-timeline-detail.svelte'

  const EMPTY_IMMEDIATE_IDS = new Set<string>()

  let {
    eligibleIds,
    isZoomInteracting,
    testId = 'promoted-ids',
  }: { eligibleIds: string[]; isZoomInteracting: boolean; testId?: string } = $props()

  const promotedIds = useStagedTimelineDetailIds(
    () => eligibleIds,
    () => EMPTY_IMMEDIATE_IDS,
    () => isZoomInteracting,
  )
</script>

<div data-testid={testId}>{Array.from(promotedIds.current).join(',')}</div>
