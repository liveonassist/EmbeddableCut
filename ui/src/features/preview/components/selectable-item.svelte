<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { TimelineItem } from '@/types/timeline'
  import type { CoordinateParams, Transform } from '@/features/preview/types/gizmo'
  import { getScreenTransformOrigin, transformToScreenBounds } from '@/features/preview/utils/coordinate-transform'
  import { notifyOnBlockedMouseDragIntent } from '@/features/preview/utils/mouse-drag-intent'

  interface SelectableItemProps {
    item: TimelineItem
    transform: Transform
    coordParams: CoordinateParams
    isSelected?: boolean
    onSelect: (e: MouseEvent) => void
    /** Called on mousedown to start dragging immediately */
    onDragStart?: (e: MouseEvent, transform: Transform) => void
    /** Linked Position owns translation, but the item remains selectable. */
    translateBlocked?: boolean
    translateBlockedLabel?: string
    /** Called only when a blocked item is moved far enough to begin a drag. */
    onTranslateBlocked?: () => void
  }

  let { item, transform, coordParams, isSelected = false, onSelect, onDragStart, translateBlocked = false, translateBlockedLabel, onTranslateBlocked }: SelectableItemProps = $props()
  let isHovered = $state.raw(false)
  const setIsHovered = (next: typeof isHovered | ((prev: typeof isHovered) => typeof isHovered)) => {
    isHovered = typeof next === 'function' ? (next as (prev: typeof isHovered) => typeof isHovered)(untrack(() => isHovered)) : next
  }
  const transformOrigin = $derived.by(() => {
    return getScreenTransformOrigin(transform, coordParams)
  })

  // Convert to screen bounds for positioning, expanding for stroke width on shapes
  const screenBounds = $derived.by(() => {
    const bounds = transformToScreenBounds(transform, coordParams)

    // Expand bounds for stroke width on shape items
    if (item.type === 'shape') {
      const strokeWidth = item.strokeWidth ?? 0

      if (strokeWidth > 0) {
        // Scale stroke width to screen space
        const scale = coordParams.playerSize.width / coordParams.projectSize.width
        const screenStroke = strokeWidth * scale

        // Expand bounds by half stroke on each side (stroke is centered on path)
        bounds.left -= screenStroke / 2
        bounds.top -= screenStroke / 2
        bounds.width += screenStroke
        bounds.height += screenStroke
      }
    }

    return bounds
  })

  // Handle mousedown - select and start dragging in one motion
  const handleMouseDown = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()

      // Select the item first
      onSelect(e)

      if (translateBlocked) {
        if (onTranslateBlocked) {
          notifyOnBlockedMouseDragIntent(e, onTranslateBlocked)
        }
        return
      }

      // Start dragging immediately if handler provided
      onDragStart?.(e, transform)
    }

  // Only show hover state for unselected items (selected items have gizmo)
  const showHover = $derived(isHovered && !isSelected)
</script>

<div
  class="absolute cursor-move"
  style:left="{screenBounds.left}px"
  style:top="{screenBounds.top}px"
  style:width="{screenBounds.width}px"
  style:height="{screenBounds.height}px"
  style:transform={`rotate(${transform.rotation}deg)`}
  style:transform-origin={transformOrigin}
  style:z-index="5"
  style:border={showHover ? '3px solid color-mix(in oklab, var(--primary) 40%, transparent)' : '2px solid transparent'}
  data-gizmo="selectable-item"
  data-translate-blocked={translateBlocked || undefined}
  aria-label={translateBlocked ? translateBlockedLabel : undefined}
  title={translateBlocked ? translateBlockedLabel : undefined}
  onmousedown={handleMouseDown}
  ondblclick={(e) => e.stopPropagation()}
  onmouseenter={() => setIsHovered(true)}
  onmouseleave={() => setIsHovered(false)}
></div>
