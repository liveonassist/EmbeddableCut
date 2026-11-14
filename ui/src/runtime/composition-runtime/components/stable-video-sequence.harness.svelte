<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import type { ResolvedTransitionWindow } from '@/shared/timeline/transitions/transition-planner'
  import { StableVideoSequence, type StableVideoSequenceItem } from './stable-video-sequence'

  // Test harness: a renderItem snippet that reports each item it renders.
  let {
    items,
    transitionWindows,
    onRenderItem,
  }: {
    items: StableVideoSequenceItem[]
    transitionWindows?: ResolvedTransitionWindow<TimelineItem>[]
    onRenderItem: (item: StableVideoSequenceItem) => void
  } = $props()
</script>

{#snippet renderItem(item: StableVideoSequenceItem)}
  <div
    data-testid="render-{item.id}"
    data-softness={item.crop?.softness ?? ''}
    data-transition-sync={String(item._sharedTransitionSync)}
    data-recorded={onRenderItem(item) ?? undefined}
  >
    {item.id}
  </div>
{/snippet}

<StableVideoSequence {items} {transitionWindows} {renderItem} />
