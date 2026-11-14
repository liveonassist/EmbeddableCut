<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import DetailProbe from './use-staged-timeline-detail-probe.harness.svelte'

  interface ProbeProps {
    eligibleIds: string[]
    isZoomInteracting: boolean
    testId?: string
  }

  let { probes }: { probes: ProbeProps[] } = $props()
</script>

{#each probes as probe, index (probe.testId ?? index)}
  <DetailProbe {...probe} />
{/each}
