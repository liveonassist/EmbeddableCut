<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { pixelsPerSecond }: { pixelsPerSecond?: number } = $props()
</script>

<div data-testid="compound-clip-waveform" data-pps={String(pixelsPerSecond)}></div>
