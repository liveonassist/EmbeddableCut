<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'

  // Test stand-in for SoundTouchWorkletAudio: shows its decoded buffer, or
  // renders its fallback as a failed worklet would.
  let {
    audioBuffer,
    sourceStartOffsetSec,
    isComplete,
    fallback,
    renderFallback = false,
  }: {
    audioBuffer: AudioBuffer
    sourceStartOffsetSec?: number
    isComplete?: boolean
    fallback?: Snippet
    renderFallback?: boolean
  } = $props()
</script>

{#if renderFallback && fallback}
  {@render fallback()}
{:else}
  <div
    data-testid="pitch"
    data-frames={audioBuffer.length}
    data-offset={sourceStartOffsetSec ?? 0}
    data-complete={isComplete ? 'true' : 'false'}
    data-has-fallback={fallback ? 'true' : 'false'}
  ></div>
{/if}
