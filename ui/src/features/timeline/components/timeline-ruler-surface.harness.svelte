<!-- SPDX-License-Identifier: MIT -->
<!-- Stands in for TimelineMarkers so the test can check the ruler keeps its mounted children. -->
<script lang="ts">
  let { duration }: { duration: number } = $props()
</script>

<div data-testid="stable-ruler-markers" data-duration={duration}></div>
