<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { useMarqueeSelection } from '@/shared/marquee/use-marquee-selection.svelte'
  import MarqueeOverlay from '@/shared/marquee/marquee-overlay.svelte'
  import { resolveTimelineMarqueeItems } from '../../utils/timeline-marquee-geometry'
  import { setTimelineDensityMarqueePreview } from '@/features/timeline/utils/timeline-density-marquee-preview'

  interface TimelineMarqueeLayerProps {
    container: HTMLDivElement | null
    itemIds: string[]
    fps: number
    duration: number
    onSelectionChange: (ids: string[]) => void
    onMarqueeActiveChange: (active: boolean) => void
    onMarqueeGestureEnd: (event: MouseEvent) => void
    onMarqueeGestureCancel: () => void
  }

  let {
    container,
    itemIds,
    fps,
    duration,
    onSelectionChange,
    onMarqueeActiveChange,
    onMarqueeGestureEnd,
    onMarqueeGestureCancel,
  }: TimelineMarqueeLayerProps = $props()

  let previewItemIds: string[] = []

  function setPreviewItemIds(ids: string[]) {
    setTimelineDensityMarqueePreview(ids)
    if (!container) {
      previewItemIds = ids
      return
    }

    const nextIds = new Set(ids)
    for (const previousId of previewItemIds) {
      if (nextIds.has(previousId)) {
        continue
      }
      container
        .querySelector(`[data-item-id="${previousId}"]`)
        ?.classList.remove('timeline-marquee-preview')
    }

    const previousIds = new Set(previewItemIds)
    for (const id of ids) {
      if (previousIds.has(id)) {
        continue
      }
      container.querySelector(`[data-item-id="${id}"]`)?.classList.add('timeline-marquee-preview')
    }

    previewItemIds = ids
  }

  $effect(() => {
    return () => {
      setPreviewItemIds([])
    }
  })

  const marqueeItems = $derived(
    itemIds.map((id) => ({
      id,
      getBoundingRect: () => {
        // Scope query to timeline container to avoid matching preview player elements
        // (video-content also uses data-item-id for the composition runtime)
        const element = container?.querySelector(`[data-item-id="${id}"]`)
        if (!element) {
          return null
        }
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        }
      },
    })),
  )

  function resolveMarqueeItems() {
    if (!container) return []
    return resolveTimelineMarqueeItems(
      container,
      itemIds,
      useItemsStore.getState().itemById,
      duration * fps,
    )
  }

  const marqueeSelection = useMarqueeSelection(() => ({
    container,
    items: marqueeItems,
    resolveItems: resolveMarqueeItems,
    onSelectionChange,
    onPreviewSelectionChange: setPreviewItemIds,
    onGestureEnd: onMarqueeGestureEnd,
    onGestureCancel: onMarqueeGestureCancel,
    enabled: itemIds.length > 0,
    threshold: 5,
    commitSelectionOnMouseUp: true,
  }))

  $effect(() => {
    const isActive = marqueeSelection.isActive
    untrack(() => onMarqueeActiveChange(isActive))
  })
</script>

<MarqueeOverlay marquee={marqueeSelection.marquee} />
