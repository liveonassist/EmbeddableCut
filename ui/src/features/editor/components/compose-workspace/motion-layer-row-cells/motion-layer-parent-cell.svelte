<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import { cn } from '@/shared/ui/cn'
  import type { ItemKeyframes } from '@/types/keyframe'
  import type { TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { PickWhipIcon } from '@/features/editor/deps/timeline-motion'
  import type { LayerParentCandidate } from '../motion-layer-row-model'
  import { LAYER_PARENT_COLUMN_WIDTH, NO_TRANSFORM_PARENT } from '../motion-timeline-primitives'
  import { applyTransformParentMenuSelection, getParentCandidateLabel } from './helpers'

  interface MotionLayerParentCellProps {
    item: TimelineItem
    parentItemId: string | undefined
    parentCandidates: readonly LayerParentCandidate[]
    isLayerLocked: boolean
    itemById: Record<string, TimelineItem>
    keyframesByItemId: Record<string, ItemKeyframes>
    canvas: CanvasSettings
    t: TFunction
    beginTransformParentDrag: (
      event: PointerEvent & { currentTarget: EventTarget & HTMLButtonElement },
      itemId: string,
      parentItemId: string | undefined,
    ) => void
  }

  /** Pick-whip plus the parent select for one layer. */
  let {
    item,
    parentItemId,
    parentCandidates,
    isLayerLocked,
    itemById,
    keyframesByItemId,
    canvas,
    t,
    beginTransformParentDrag,
  }: MotionLayerParentCellProps = $props()
</script>

<div
  data-testid="motion-parent-cell-{item.id}"
  class="flex shrink-0 items-center gap-1 border-l border-border px-1"
  style:width="{LAYER_PARENT_COLUMN_WIDTH}px"
>
  <button
    type="button"
    data-testid="motion-parent-pick-whip-{item.id}"
    disabled={isLayerLocked}
    onpointerdown={(event) => !isLayerLocked && beginTransformParentDrag(event, item.id, parentItemId)}
    aria-label={t('editor.compose.parentPickWhipForLayer', {
      defaultValue: 'Parent pick whip for {{name}}',
      name: item.label || item.type,
    })}
    title={t('editor.compose.parentPickWhipHelp', {
      defaultValue:
        'Drag to a parent layer. Shift: snap position. Alt: use local pose. Ctrl/Cmd-click: detach.',
    })}
    class={cn(
      'flex h-6 w-6 shrink-0 touch-none items-center justify-center rounded-sm outline-none transition-colors hover:bg-accent focus-visible:ring-1 focus-visible:ring-primary',
      parentItemId ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    <PickWhipIcon class="h-3.5 w-3.5" />
  </button>
  <!-- Controlled by the item: a rejected parent leaves the select on the current one. -->
  <Select
    disabled={isLayerLocked}
    bind:value={
      () => parentItemId ?? NO_TRANSFORM_PARENT,
      (value) =>
        applyTransformParentMenuSelection({
          value: value ?? NO_TRANSFORM_PARENT,
          currentParentItemId: parentItemId,
          childItemId: item.id,
          itemById,
          keyframesByItemId,
          canvas,
          t,
        })
    }
  >
    <SelectTrigger
      aria-label={t('editor.compose.parentForLayer', {
        defaultValue: 'Parent for {{name}}',
        name: item.label || item.type,
      })}
      class="h-6 min-w-0 flex-1 gap-1 border-transparent bg-transparent px-1.5 py-0 text-[9px] shadow-none hover:border-input hover:bg-background data-[state=open]:border-primary/50 data-[state=open]:bg-background [&>svg]:h-3 [&>svg]:w-3"
    >
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={NO_TRANSFORM_PARENT} class="text-[10px]">
        {t('editor.transformHierarchy.none', { defaultValue: 'None' })}
      </SelectItem>
      {#each parentCandidates as { item: candidate, layerNumber } (candidate.id)}
        <SelectItem value={candidate.id} class="text-[10px]">
          <span class="mr-1 text-muted-foreground">{layerNumber}.</span>{getParentCandidateLabel(candidate, t)}
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
