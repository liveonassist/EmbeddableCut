<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { VideoConfigProvider } from '@/runtime/composition-runtime/deps/player'
  import ItemContent from './item-content.svelte'

  // Test harness: ItemContent in a 1920×1080 player config, with composition
  // content rendered as a marker div when `compositionContent` is set.
  let { item, compositionContent = false }: { item: TimelineItem; compositionContent?: boolean } =
    $props()
</script>

{#snippet renderCompositionContent()}
  {#if compositionContent}
    <div data-testid="composition-content"></div>
  {/if}
{/snippet}

<VideoConfigProvider fps={30} width={1920} height={1080} durationInFrames={30}>
  <ItemContent {item} {renderCompositionContent} />
</VideoConfigProvider>
