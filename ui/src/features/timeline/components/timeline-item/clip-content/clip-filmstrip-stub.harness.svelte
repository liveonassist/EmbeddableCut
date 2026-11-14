<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  let { pixelsPerSecond, isVisible }: { pixelsPerSecond: number; isVisible: boolean } = $props()
</script>

<div
  data-testid="clip-filmstrip"
  data-pps={String(pixelsPerSecond)}
  data-visible={String(isVisible)}
></div>
