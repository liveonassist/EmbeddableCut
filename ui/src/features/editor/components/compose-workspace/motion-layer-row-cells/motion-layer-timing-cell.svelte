<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import type { TimelineItem } from '@/types/timeline'
  import { LAYER_TIMING_COLUMN_WIDTH } from '../motion-timeline-primitives'
  import LayerFrameInput from './layer-frame-input.svelte'

  interface MotionLayerTimingCellProps {
    item: TimelineItem
    isLayerLocked: boolean
    durationInFrames: number
    t: TFunction
    updateItem: (itemId: string, updates: Partial<TimelineItem>) => void
  }

  /** In/out frame inputs for one layer. */
  let { item, isLayerLocked, durationInFrames, t, updateItem }: MotionLayerTimingCellProps = $props()
</script>

<div
  data-testid="motion-timing-cell-{item.id}"
  class="flex shrink-0 items-center gap-1 border-l border-border px-1"
  style:width="{LAYER_TIMING_COLUMN_WIDTH}px"
>
  <LayerFrameInput
    label="I"
    ariaLabel={t('editor.compose.inFrame')}
    value={item.from}
    min={0}
    max={Math.max(0, item.from + item.durationInFrames - 1)}
    disabled={isLayerLocked}
    onCommit={(nextFrom) =>
      updateItem(item.id, {
        from: nextFrom,
        durationInFrames: Math.max(1, item.from + item.durationInFrames - nextFrom),
      })}
  />
  <LayerFrameInput
    label="O"
    ariaLabel={t('editor.compose.outFrame')}
    value={item.from + item.durationInFrames}
    min={item.from + 1}
    max={durationInFrames}
    disabled={isLayerLocked}
    onCommit={(nextOut) =>
      updateItem(item.id, {
        durationInFrames: Math.max(1, nextOut - item.from),
      })}
  />
</div>
