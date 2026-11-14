<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { useAnimatedTransform, useAnimatedTransforms } from './use-animated-transform.svelte'

  // Test probe: renders the resolved transform of `item` (or of `alternate`
  // once the switch button is pressed), through the single or batched hook.
  let {
    item,
    alternate,
    testId,
  }: { item: TimelineItem; alternate?: TimelineItem; testId: string } = $props()

  const PROJECT_SIZE = { width: 1920, height: 1080 }

  let useAlternate = $state(false)
  const activeItem = $derived(useAlternate && alternate ? alternate : item)

  const single = useAnimatedTransform(
    () => activeItem,
    () => PROJECT_SIZE,
  )
  const multi = useAnimatedTransforms(
    () => [activeItem],
    () => PROJECT_SIZE,
  )
  const batched = $derived(multi.current.get(activeItem.id))
</script>

<button type="button" data-testid="switch-item" onclick={() => (useAlternate = !useAlternate)}>
  Switch
</button>
<div
  data-testid={testId}
  data-x={String(single.transform.x)}
  data-height={String(single.transform.height)}
  data-relative-frame={String(single.relativeFrame)}
  data-multi-x={String(batched?.x ?? Number.NaN)}
  data-multi-height={String(batched?.height)}
></div>
