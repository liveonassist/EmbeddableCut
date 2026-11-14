<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { getItemColor, type CanvasItemRect } from './bento-layout-dialog-model'

  interface Props {
    rect: CanvasItemRect
    isDragging: boolean
    isDropTarget: boolean
    dragOffset: { x: number; y: number } | null
    onMouseDown: (e: MouseEvent) => void
  }

  let { rect, isDragging, isDropTarget, dragOffset, onMouseDown }: Props = $props()

  const color = $derived(getItemColor(rect.type))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  style:position="absolute"
  style:left="{rect.left}px"
  style:top="{rect.top}px"
  style:width="{rect.width}px"
  style:height="{rect.height}px"
  style:transform={isDragging && dragOffset
    ? `translate(${dragOffset.x}px, ${dragOffset.y}px)`
    : undefined}
  style:z-index={isDragging ? 50 : 1}
  style:transition={isDragging
    ? 'none'
    : 'left 0.2s ease, top 0.2s ease, width 0.2s ease, height 0.2s ease'}
  onmousedown={onMouseDown}
  class={cn(
    'rounded border select-none cursor-grab overflow-hidden',
    'flex items-center justify-center',
    color.bg,
    color.border,
    isDragging && 'shadow-lg opacity-80 cursor-grabbing',
    isDropTarget && 'ring-2 ring-primary ring-dashed',
    !isDragging && 'hover:brightness-110',
  )}
>
  <span
    class="text-[10px] text-white font-medium truncate px-1 pointer-events-none drop-shadow-sm"
  >
    {rect.label}
  </span>
</div>
