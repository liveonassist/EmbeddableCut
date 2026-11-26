<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem, ImageItem } from '@/types/timeline'

  // Speed limits (matching rate-stretch)
  const MIN_SPEED = 0.1
  const MAX_SPEED = 10.0

  /**
   * Check if an image item is an animated image (GIF or WebP) based on its label
   */
  function isAnimatedImageItem(item: TimelineItem): item is ImageItem {
    if (item.type !== 'image') return false
    const label = item.label?.toLowerCase() ?? ''
    return label.endsWith('.gif') || label.endsWith('.webp')
  }
</script>

<script lang="ts">
  import Image from '@lucide/svelte/icons/image'
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import {
    captureSnapshot,
    rateStretchItemWithoutHistory,
    useItemsStore,
    useTimelineCommandStore,
  } from '@/features/editor/deps/timeline-store'
  import { PropertySection, PropertyRow, NumberInput } from '../components'
  import { getMixedValue } from '../utils'

  interface GifSectionProps {
    items: TimelineItem[]
  }

  /**
   * Animation section - playback speed for animated GIFs and animated WebP.
   * Only shown when selection includes animated image clips.
   *
   * Unlike videos, animated image speed changes don't affect duration (they loop):
   * - Faster speed = animation plays faster within same duration
   * - Slower speed = animation plays slower within same duration
   */
  let { items }: GifSectionProps = $props()

  const gifItems = $derived(items.filter(isAnimatedImageItem))

  const itemIds = $derived(gifItems.map((item) => item.id))
  let speedDragSnapshot: ReturnType<typeof captureSnapshot> | null = null

  // Get current speed (defaults to 1)
  const speed = $derived(getMixedValue(gifItems, (item) => item.speed, 1))

  const applySpeedChangeWithoutHistory = (newSpeed: number) => {
    // Round to 2 decimal places to match clip label precision and avoid floating point drift
    const roundedSpeed = Math.round(newSpeed * 100) / 100
    // Clamp speed to valid range
    const clampedSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, roundedSpeed))

    const currentItems = useItemsStore.getState().items
    currentItems
      .filter(
        (item: TimelineItem): item is ImageItem =>
          isAnimatedImageItem(item) && itemIds.includes(item.id),
      )
      .forEach((item: ImageItem) => {
        rateStretchItemWithoutHistory(item.id, item.from, item.durationInFrames, clampedSpeed)
      })

    return clampedSpeed
  }

  const commitSpeedChange = (newSpeed: number) => {
    const beforeSnapshot = speedDragSnapshot ?? captureSnapshot()
    const clampedSpeed = applySpeedChangeWithoutHistory(newSpeed)
    useTimelineCommandStore.getState().addUndoEntry(
      {
        type: 'RATE_STRETCH_ITEM',
        payload: { ids: itemIds, newSpeed: clampedSpeed },
      },
      beforeSnapshot,
    )
    speedDragSnapshot = null
  }

  const handleSpeedLiveChange = (newSpeed: number) => {
    if (!speedDragSnapshot) {
      speedDragSnapshot = captureSnapshot()
    }
    applySpeedChangeWithoutHistory(newSpeed)
  }

  // Reset speed to 1x
  const handleResetSpeed = () => {
    const tolerance = 0.01
    const needsReset = useItemsStore
      .getState()
      .items.some(
        (item: TimelineItem) =>
          isAnimatedImageItem(item) &&
          itemIds.includes(item.id) &&
          Math.abs((item.speed || 1) - 1) > tolerance,
      )
    if (!needsReset) return

    commitSpeedChange(1)
  }
</script>

{#if gifItems.length > 0}
  <PropertySection title={t('editor.gifSection.animation')} icon={Image} defaultOpen={true}>
    <!-- Playback Speed - affects animation rate (not duration) -->
    <PropertyRow label={t('editor.gifSection.speed')}>
      <div class="flex items-center gap-1 w-full">
        <NumberInput
          value={speed}
          onChange={commitSpeedChange}
          onLiveChange={handleSpeedLiveChange}
          min={MIN_SPEED}
          max={MAX_SPEED}
          step={0.1}
          unit="x"
          class="flex-1 min-w-0"
        />
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 flex-shrink-0"
          onclick={handleResetSpeed}
          title={t('editor.gifSection.resetSpeed')}
        >
          <RotateCcw class="w-3.5 h-3.5" />
        </Button>
      </div>
    </PropertyRow>
  </PropertySection>
{/if}
