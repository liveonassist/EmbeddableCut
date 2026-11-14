<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import { t } from '$lib/i18n.svelte'
  import { cn } from '@/shared/ui/cn'
  import { getKeyframeGroupLabel } from '@/features/keyframes/utils/property-i18n'
  import { getDisplayedGroupFrameGroups } from '../sheet-preview-frame-groups'
  import { KEYFRAME_DIAMOND_SIDE_PX, KEYFRAME_EDGE_INSET } from '../layout'
  import { getTimelineGridLineStyle, type GroupTimelineCellProps } from './types'

  let {
    groupId,
    groupLabel,
    expanded,
    frameGroups,
    rows,
    ticks,
    axisWidth,
    frameToX,
    gridFrameToX,
    getRenderedKeyframeX,
    selectedKeyframeIds,
    disabled,
    isPropertyLocked,
    onGroupKeyframePointerDown,
    onBackgroundPointerDown,
    sheetPreviewFrames,
    sheetPreviewDuplicateKeyframeIds,
  }: GroupTimelineCellProps = $props()

  const displayedFrameGroups = $derived(
    getDisplayedGroupFrameGroups({
      group: { rows, frameGroups },
      sheetPreviewFrames,
      sheetPreviewDuplicateKeyframeIds,
    }),
  )
  const renderedFrameGroups = $derived(
    sheetPreviewDuplicateKeyframeIds ? frameGroups : displayedFrameGroups,
  )
  const gridLineStyle = $derived(getTimelineGridLineStyle(ticks, gridFrameToX ?? frameToX))
  const groupDisplayLabel = $derived(getKeyframeGroupLabel(t as TFunction, groupId, groupLabel))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative h-full border-l border-border/60 bg-muted/20 overflow-hidden"
  onpointerdown={onBackgroundPointerDown}
>
  <div
    data-motion-viewport-surface
    data-motion-viewport-edge-inset={KEYFRAME_EDGE_INSET}
    data-motion-viewport-axis-width={axisWidth}
    class="absolute inset-0"
  >
    <div
      aria-hidden="true"
      data-motion-grid-frames={ticks.join(',')}
      class="pointer-events-none absolute inset-y-0 w-px bg-current text-border/30"
      style:left="{gridLineStyle.left}px"
      style:box-shadow={gridLineStyle.boxShadow}
    ></div>

    <div data-motion-span-drag-visual class="absolute inset-0">
      {#if !expanded}
        {#each renderedFrameGroups as frameGroup (`${groupId}-${frameGroup.frame}`)}
          {@const renderedX = getRenderedKeyframeX(frameGroup.frame) ?? frameToX(frameGroup.frame)}
          {@const movableEntries = frameGroup.keyframes.filter(
            ({ property }) => !isPropertyLocked(property),
          )}
          {@const isSelected = movableEntries.some(({ keyframe }) =>
            selectedKeyframeIds.has(keyframe.id),
          )}
          {@const label = t('timeline.keyframeEditor.keyframeMarker.groupLabel', {
            group: groupDisplayLabel,
            frame: frameGroup.frame,
          })}
          <button
            type="button"
            data-testid="group-keyframe-{groupId}-{frameGroup.frame}"
            data-dopesheet-frame={frameGroup.frame}
            class={cn(
              'group absolute z-10 flex h-3 w-3 -ml-1.5 -mt-1.5 items-center justify-center',
              movableEntries.length > 0 && 'cursor-grab active:cursor-grabbing',
              movableEntries.length === 0 && 'cursor-not-allowed opacity-50',
            )}
            style:left="{renderedX}px"
            style:top="50%"
            disabled={movableEntries.length === 0 || disabled}
            onpointerdown={(event) => onGroupKeyframePointerDown(frameGroup, event)}
            onclick={(event) => event.stopPropagation()}
            title={label}
            aria-label={label}
          >
            <span
              class={cn(
                'pointer-events-none block rotate-45 border transition-colors',
                isSelected
                  ? 'border-blue-100 bg-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.45)]'
                  : 'border-transparent bg-neutral-200 group-hover:bg-white',
              )}
              style:width="{KEYFRAME_DIAMOND_SIDE_PX}px"
              style:height="{KEYFRAME_DIAMOND_SIDE_PX}px"
            ></span>
          </button>
        {/each}
        {#if sheetPreviewDuplicateKeyframeIds}
          {#each displayedFrameGroups as frameGroup (`preview-${groupId}-${frameGroup.frame}`)}
            {@const renderedX =
              getRenderedKeyframeX(frameGroup.frame) ?? frameToX(frameGroup.frame)}
            <div
              data-dopesheet-frame={frameGroup.frame}
              class="absolute z-20 flex h-3 w-3 -ml-1.5 -mt-1.5 items-center justify-center pointer-events-none"
              style:left="{renderedX}px"
              style:top="50%"
            >
              <span
                class="block rotate-45 border border-primary/70 bg-primary/70 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                style:width="{KEYFRAME_DIAMOND_SIDE_PX}px"
                style:height="{KEYFRAME_DIAMOND_SIDE_PX}px"
              ></span>
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>
</div>
