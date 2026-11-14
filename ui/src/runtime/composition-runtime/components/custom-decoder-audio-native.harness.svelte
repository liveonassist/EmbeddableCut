<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Test stand-in for NativePitchCorrectedAudio.
  let { src, sourceStartOffsetSec }: { src: string; sourceStartOffsetSec?: number } = $props()
</script>

<div data-testid="native-fallback" data-src={src} data-offset={sourceStartOffsetSec ?? 0}></div>
