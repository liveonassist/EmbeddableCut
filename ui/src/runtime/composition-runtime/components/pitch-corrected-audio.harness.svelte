<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Test stand-in for SoundTouchWorkletAudio: shows which decoded buffer it was given.
  let {
    audioBuffer,
    sourceStartOffsetSec,
  }: { audioBuffer: AudioBuffer; sourceStartOffsetSec?: number } = $props()
</script>

<div
  data-testid="pitch"
  data-frames={audioBuffer.length}
  data-offset={sourceStartOffsetSec ?? 0}
></div>
