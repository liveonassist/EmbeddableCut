<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'

  function getFramePositionStyle(frame: number): string {
    return `calc(${frame} * var(--timeline-percent-per-frame, 0%))`
  }

  function getBucketColorClasses(item: TimelineItem): string {
    switch (item.type) {
      case 'video':
      case 'composition':
        return 'bg-timeline-video border-timeline-video'
      case 'audio':
        return 'bg-timeline-audio border-timeline-audio'
      case 'image':
        return 'bg-timeline-image/40 border-timeline-image'
      case 'text':
        return 'bg-timeline-text/40 border-timeline-text'
      case 'shape':
        return 'bg-timeline-shape/40 border-timeline-shape'
      case 'adjustment':
        return 'bg-violet-950/80 border-violet-500/70'
      default:
        return 'bg-muted border-border'
    }
  }

  function suppressTransferredPointerClick() {
    let fallbackTimer = 0
    const cleanup = () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('mouseup', handleMouseUp, true)
      window.clearTimeout(fallbackTimer)
    }
    const handleClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      cleanup()
    }
    const handleMouseUp = () => {
      // A click is dispatched after mouseup in the same task. Keep the capture
      // listener through that dispatch, then remove it if this became a drag.
      window.setTimeout(cleanup, 0)
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('mouseup', handleMouseUp, true)
    fallbackTimer = window.setTimeout(cleanup, 1000)
  }
</script>

<script lang="ts">
  import { flushSync } from 'svelte'
  import { select, shallow } from '$lib/store.svelte'
  import { cn } from '@/shared/ui/cn'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'
  import { emitUiSound } from '@/shared/ui/ui-sound'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import {
    expandSelectionWithLinkedItems,
    getLinkedItemIds,
  } from '@/features/timeline/utils/linked-items'
  import {
    buildTimelineDensityBuckets,
    findTimelineDensityBucketItem,
    type TimelineDensityBucket,
  } from '@/features/timeline/utils/timeline-density-overview'
  import {
    DENSE_TIMELINE_MAX_OVERVIEW_BUCKETS_PER_TRACK,
  } from '@/features/timeline/utils/timeline-dom-density'
  import {
    registerTimelineDensityMarqueeBucket,
  } from '@/features/timeline/utils/timeline-density-marquee-preview'
  import { useLinkedEditPreviewStore } from '@/features/timeline/stores/linked-edit-preview-store'

  interface TimelineDensityOverviewProps {
    items: ReadonlyArray<TimelineItem>
    selectedItemIds: ReadonlySet<string>
    trackLocked: boolean
    trackHidden: boolean
  }

  let { items, selectedItemIds, trackLocked, trackHidden }: TimelineDensityOverviewProps = $props()

  let overview = $state<HTMLDivElement | null>(null)
  const itemIds = $derived(items.map((item) => item.id))
  const previewUpdates = $derived(
    select(
      useLinkedEditPreviewStore,
      (state) => itemIds.map((itemId) => state.updatesById[itemId] ?? null),
      shallow,
    ),
  )
  const previewItems = $derived(
    items.flatMap((item, index) => {
      const update = previewUpdates.current[index]
      if (!update) return [item]
      if (update.hidden) return []
      return [{ ...item, ...update } as TimelineItem]
    }),
  )
  const buckets = $derived(
    buildTimelineDensityBuckets(previewItems, DENSE_TIMELINE_MAX_OVERVIEW_BUCKETS_PER_TRACK),
  )

  $effect(() => {
    const element = overview
    const currentBuckets = buckets
    if (!element) return
    const elements = element.querySelectorAll<HTMLElement>('[data-timeline-density-bucket]')
    const unregisterBuckets = currentBuckets.map((bucket, index) => {
      const bucketElement = elements[index]
      return bucketElement
        ? registerTimelineDensityMarqueeBucket(
            bucketElement,
            bucket.items.map((item) => item.id),
          )
        : () => {}
    })
    return () => unregisterBuckets.forEach((unregister) => unregister())
  })

  const handleBucketMouseDown = (event: MouseEvent, bucket: TimelineDensityBucket) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (trackLocked) {
      emitUiSound('error')
      return
    }

    const bucketElement = event.currentTarget as HTMLElement
    const rect = bucketElement.getBoundingClientRect()
    const ratio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
    const frame = bucket.from + ratio * bucket.durationInFrames
    const item = findTimelineDensityBucketItem(bucket, frame)
    const selection = useSelectionStore.getState()
    const activeTool = selection.activeTool
    const allItems = useItemsStore.getState().items
    const linkedSelectionEnabled = useEditorStore.getState().linkedSelectionEnabled
    const targetIds = linkedSelectionEnabled ? getLinkedItemIds(allItems, item.id) : [item.id]
    if (event.metaKey || event.ctrlKey) {
      const targetSet = new Set(targetIds)
      const alreadySelected = targetIds.some((id) => selection.selectedItemIds.includes(id))
      flushSync(() =>
        selection.selectItems(
          alreadySelected
            ? selection.selectedItemIds.filter((id) => !targetSet.has(id))
            : linkedSelectionEnabled
              ? expandSelectionWithLinkedItems(allItems, [
                  ...selection.selectedItemIds,
                  ...targetIds,
                ])
              : Array.from(new Set([...selection.selectedItemIds, ...targetIds])),
        ),
      )
      suppressTransferredPointerClick()
      return
    }

    emitUiSound('select')
    // The native root must exist before the physical pointer is
    // released so its drag/trim listeners receive the real mouseup.
    flushSync(() => selection.selectItems(targetIds))
    const { clientX, clientY, shiftKey, altKey } = event
    const root = bucketElement.getRootNode() as Document | ShadowRoot
    const promoted = Array.from(
      root.querySelectorAll<HTMLElement>('[data-timeline-item][data-item-id]'),
    ).find((element) => element.dataset.itemId === item.id)
    promoted?.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY,
        shiftKey,
        altKey,
      }),
    )
    // Promotion changes the physical mouseup target, so the browser
    // will not synthesize a click for the original bucket. Razor has
    // no held gesture; transfer its click while the native root is live.
    if (activeTool === 'razor') {
      promoted?.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX,
          clientY,
          shiftKey,
          altKey,
        }),
      )
    }
    suppressTransferredPointerClick()
  }
</script>

<div
  bind:this={overview}
  data-timeline-density-overview
  data-density-bucket-count={buckets.length}
  class="absolute inset-0"
  style:contain="layout style paint"
>
  {#each buckets as bucket (bucket.index)}
    {@const hasSelectedItem = bucket.items.some((item) => selectedItemIds.has(item.id))}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div
      data-timeline-density-bucket
      data-density-bucket-index={bucket.index}
      data-density-item-count={bucket.items.length}
      aria-label="{bucket.items.length} clips"
      class={cn(
        'absolute inset-y-px rounded-sm border overflow-hidden',
        getBucketColorClasses(bucket.items[0]!),
        trackLocked ? 'cursor-not-allowed' : 'cursor-default hover:brightness-110',
        hasSelectedItem && 'ring-1 ring-primary ring-inset',
      )}
      style:left={getFramePositionStyle(bucket.from)}
      style:width={getFramePositionStyle(bucket.durationInFrames)}
      style:opacity={trackHidden ? 0.3 : trackLocked ? 0.6 : 1}
      style:contain="layout style paint"
      onmousedown={(event) => handleBucketMouseDown(event, bucket)}
      onclick={(event) => event.stopPropagation()}
    ></div>
  {/each}
</div>
