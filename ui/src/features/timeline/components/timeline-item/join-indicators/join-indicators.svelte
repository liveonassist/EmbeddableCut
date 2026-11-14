<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import type { JoinIndicatorsProps } from './types'

  /**
   * Join indicators for timeline items
   * Shows glowing edges when clips can be joined with neighbors
   */
  let {
    hasJoinableLeft,
    hasJoinableRight,
    trackLocked,
    dragAffectsJoin,
    hoveredEdge,
    isTrimming,
    isStretching,
    isBeingDragged,
  }: JoinIndicatorsProps = $props()

  // Hide join indicators when this item is being dragged (anchor or follower)
  // This ensures indicators don't show when moving to a different track
  const showLeft = $derived(
    hasJoinableLeft &&
      !trackLocked &&
      !dragAffectsJoin.left &&
      !isBeingDragged &&
      hoveredEdge !== 'start' &&
      !isTrimming &&
      !isStretching,
  )

  const showRight = $derived(
    hasJoinableRight &&
      !trackLocked &&
      !dragAffectsJoin.right &&
      !isBeingDragged &&
      hoveredEdge !== 'end' &&
      !isTrimming &&
      !isStretching,
  )
</script>

<div
  class={cn(
    'absolute left-0 top-0 bottom-0 w-px pointer-events-none transition-opacity duration-75',
    showLeft ? 'opacity-100' : 'opacity-0',
  )}
  style:background-color="var(--color-timeline-join)"
  style:box-shadow="0 0 3px 0 var(--color-timeline-join)"
  title={t('timeline.joinIndicators.canJoinPrevious')}
></div>
<div
  class={cn(
    'absolute right-0 top-0 bottom-0 w-px pointer-events-none transition-opacity duration-75',
    showRight ? 'opacity-100' : 'opacity-0',
  )}
  style:background-color="var(--color-timeline-join)"
  style:box-shadow="0 0 3px 0 var(--color-timeline-join)"
  title={t('timeline.joinIndicators.canJoinNext')}
></div>
