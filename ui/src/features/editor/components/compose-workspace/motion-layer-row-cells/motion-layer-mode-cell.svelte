<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { BLEND_MODE_GROUPS } from '@/types/blend-modes'

  const ALL_BLEND_MODES = BLEND_MODE_GROUPS.flatMap((group) => group.modes)
</script>

<script lang="ts">
  import type { TFunction } from 'i18next'
  import type { BlendMode } from '@/types/blend-modes'
  import { BLEND_MODE_LABELS } from '@/types/blend-modes'
  import type { TimelineItem } from '@/types/timeline'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { LAYER_MODE_COLUMN_WIDTH } from '../motion-timeline-primitives'

  interface MotionLayerModeCellProps {
    item: TimelineItem
    isLayerLocked: boolean
    t: TFunction
    updateItem: (itemId: string, updates: Partial<TimelineItem>) => void
  }

  /** Blend-mode select for one layer. */
  let { item, isLayerLocked, t, updateItem }: MotionLayerModeCellProps = $props()
</script>

<div class="flex shrink-0 items-center border-l border-border px-1" style:width="{LAYER_MODE_COLUMN_WIDTH}px">
  <Select
    disabled={isLayerLocked}
    value={item.blendMode ?? 'normal'}
    onValueChange={(value) => updateItem(item.id, { blendMode: value as BlendMode })}
  >
    <SelectTrigger
      class="h-5 w-full gap-1 bg-background px-2 text-[9px] text-muted-foreground"
      aria-label={t('editor.compose.blendMode')}
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent class="max-h-72">
      {#each ALL_BLEND_MODES as mode (mode)}
        <SelectItem value={mode} class="text-[10px]">
          {BLEND_MODE_LABELS[mode]}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
