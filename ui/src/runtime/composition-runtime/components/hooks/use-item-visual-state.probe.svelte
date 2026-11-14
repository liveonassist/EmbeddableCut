<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ItemKeyframes } from '@/types/keyframe'
  import type { TimelineItem } from '@/types/timeline'
  import { buildItemTransformDependencyPlan } from '../../contexts/live-item-transform-context.svelte'
  import { useItemVisualState } from './use-item-visual-state.svelte'

  // Test probe: renders the resolved transform x, optionally with a dependency plan.
  let {
    item,
    items,
    keyframes,
    plan,
  }: {
    item: TimelineItem
    items: TimelineItem[]
    keyframes: ItemKeyframes[]
    plan: 'none' | 'imperative-parent' | 'planned'
  } = $props()

  const transformDependencyPlan = $derived(
    plan === 'none'
      ? undefined
      : plan === 'imperative-parent'
        ? buildItemTransformDependencyPlan(
            item,
            (itemId) => (itemId === item.transformParent?.parentItemId ? items.find((i) => i.id === itemId) : undefined),
            () => undefined,
          )
        : buildItemTransformDependencyPlan(
            item,
            (itemId) => items.find((candidate) => candidate.id === itemId),
            (itemId) => keyframes.find((candidate) => candidate.itemId === itemId),
          ),
  )
  const visual = useItemVisualState(
    () => item,
    () => [],
    () => ({ transformDependencyPlan }),
  )
</script>

<output data-testid="transform-x">{visual.transform.x}</output>
