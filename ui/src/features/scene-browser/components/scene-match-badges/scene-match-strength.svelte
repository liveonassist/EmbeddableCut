<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { SceneMatchSignals } from '@/features/scene-browser/utils/rank'
  import { imageFraction, textFraction } from './shared'

  /**
   * Horizontal strength bar — fills proportionally to the calibrated
   * tier range, NOT the raw cosine. A 0.38 text hit shows as ~50%
   * filled rather than 38%, because 0.38 actually represents a solid
   * match in all-MiniLM's compressed output distribution.
   */
  let { signals, score }: { signals: SceneMatchSignals; score: number } = $props()

  const hasTextScore = $derived(typeof signals.textScore === 'number')
  const hasImageScore = $derived(typeof signals.imageScore === 'number')
  const textPct = $derived(hasTextScore ? textFraction(signals.textScore!) : 0)
  const imagePct = $derived(hasImageScore ? imageFraction(signals.imageScore!) : 0)
</script>

{#if signals.ranker === 'keyword'}
  <div class="h-0.5 w-full overflow-hidden rounded-full bg-amber-400/10">
    <div
      class="h-full bg-amber-400/70"
      style:width="{Math.max(20, Math.min(100, score * 100))}%"
    ></div>
  </div>
{:else if hasTextScore || hasImageScore}
  <!-- Palette-only ranking has neither text nor image cosines — showing
       two empty bars reads as broken UI, so skip the strength row entirely. -->
  <div class="flex h-0.5 w-full gap-0.5">
    <div class="flex-1 overflow-hidden rounded-full bg-sky-400/10">
      <div class="h-full bg-sky-400/70" style:width="{textPct * 100}%"></div>
    </div>
    <div class="flex-1 overflow-hidden rounded-full bg-purple-400/10">
      <div class="h-full bg-purple-400/70" style:width="{imagePct * 100}%"></div>
    </div>
  </div>
{/if}
