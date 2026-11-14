<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { useMarqueeSelection, type Rect } from './use-marquee-selection.svelte'

  interface MarqueeHarnessProps {
    children?: Snippet
    useBatchResolver?: boolean
    onSelectionChange: (ids: string[]) => void
    onPreviewSelectionChange?: (ids: string[]) => void
    onGestureEnd: (event: MouseEvent, wasActualDrag: boolean) => void
    onGestureCancel?: (wasActualDrag: boolean) => void
    committedSelectionIds?: readonly string[]
    liveCommitThrottleMs?: number
  }

  function createRect(left: number, top: number, right: number, bottom: number): Rect {
    return { left, top, right, bottom, width: right - left, height: bottom - top }
  }

  let {
    children,
    useBatchResolver = false,
    onSelectionChange,
    onPreviewSelectionChange,
    onGestureEnd,
    onGestureCancel,
    committedSelectionIds,
    liveCommitThrottleMs = 0,
  }: MarqueeHarnessProps = $props()

  let container = $state<HTMLDivElement | null>(null)
  const items = [
    { id: 'clip-1', getBoundingRect: () => createRect(20, 20, 40, 40) },
    { id: 'clip-2', getBoundingRect: () => createRect(70, 70, 90, 90) },
  ]
  const resolveItems = $derived(
    useBatchResolver
      ? () => [
          { id: 'clip-1', rect: createRect(120, 120, 140, 140) },
          { id: 'clip-2', rect: createRect(20, 20, 40, 40) },
        ]
      : undefined,
  )

  const selection = useMarqueeSelection(() => ({
    container,
    items,
    resolveItems,
    onSelectionChange,
    onPreviewSelectionChange,
    committedSelectionIds,
    onGestureEnd,
    onGestureCancel,
    commitSelectionOnMouseUp: true,
    liveCommitThrottleMs,
  }))
</script>

<div bind:this={container} data-marquee-active={selection.isActive} data-testid="marquee-container">
  {@render children?.()}
</div>
