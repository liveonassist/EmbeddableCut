<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { pixelsPerSecond }: { pixelsPerSecond: number } = $props()
</script>

<div data-testid="image-filmstrip" data-pps={String(pixelsPerSecond)}></div>
