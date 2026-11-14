<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getTimelineJoinIndicatorsEnabled } from './context'
  import JoinIndicators from './join-indicators.svelte'
  import type { JoinIndicatorsProps } from './types'

  /**
   * Keeps the global 30 PPS branch off the TimelineItem render path. Crossing
   * that threshold updates only these tiny leaves, a frame late on promotion, so
   * a dense split cohort never re-runs every full clip component.
   */
  let props: JoinIndicatorsProps = $props()

  const enabled = getTimelineJoinIndicatorsEnabled()
</script>

{#if enabled.current}
  <JoinIndicators {...props} />
{/if}
