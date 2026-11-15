<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { useFeatures } from '../extensions/feature-gate.svelte'
  import type { FeatureId, FeatureTarget } from '../extensions/features'

  /**
   * A built-in piece of UI the host can switch off. Hidden, nothing renders;
   * locked, it renders inert and dimmed, so it reads as unavailable and takes
   * no input. The wrapper adds no box of its own.
   */
  let {
    id,
    target,
    children,
  }: { id: FeatureId | readonly FeatureId[]; target?: FeatureTarget; children: Snippet } = $props()

  const features = useFeatures()
  const mode = $derived(features.mode(id, target))
</script>

{#if mode === 'on'}
  {@render children()}
{:else if mode === 'locked'}
  <div class="contents *:opacity-50" inert aria-disabled="true" data-feature-locked={String(id)}>
    {@render children()}
  </div>
{/if}
