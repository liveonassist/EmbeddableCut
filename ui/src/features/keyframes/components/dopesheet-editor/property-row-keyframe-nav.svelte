<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ChevronLeft from 'lucide-svelte/icons/chevron-left'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { Button } from '@/components/ui/button'
  import { cn } from '@/shared/ui/cn'
  import type { PropertyRowKeyframeNavProps } from './property-row-keyframe-nav'

  /**
   * Previous / toggle / next keyframe buttons at the trailing edge of a
   * dopesheet property row.
   */
  let {
    property,
    rowLabel,
    prevKeyframe,
    nextKeyframe,
    currentKeyframes,
    hasKeyframeAtCurrentFrame,
    disabled,
    rowLocked,
    isCurrentFrameBlocked,
    canNavigate,
    canAddKeyframe,
    onNavigate,
    onToggleKeyframe,
    t,
  }: PropertyRowKeyframeNavProps = $props()

  const previousLabel = $derived(
    t('timeline.keyframeEditor.previousPropertyKeyframe', {
      property: rowLabel,
      defaultValue: `Previous ${rowLabel} keyframe`,
    }),
  )
  const nextLabel = $derived(
    t('timeline.keyframeEditor.nextPropertyKeyframe', {
      property: rowLabel,
      defaultValue: `Next ${rowLabel} keyframe`,
    }),
  )
  const toggleLabel = $derived(
    !hasKeyframeAtCurrentFrame && isCurrentFrameBlocked
      ? t('timeline.keyframeEditor.transitionBlocked')
      : hasKeyframeAtCurrentFrame
        ? t('timeline.keyframeEditor.removePropertyKeyframeAtPlayhead', {
            property: rowLabel,
            defaultValue: `Remove ${rowLabel} keyframe at playhead`,
          })
        : t('timeline.keyframeEditor.togglePropertyKeyframeAtPlayhead', {
            property: rowLabel,
            defaultValue: `Toggle ${rowLabel} keyframe at playhead`,
          }),
  )
</script>

<div
  class="flex w-[60px] shrink-0 items-center gap-0 rounded-sm border border-border/70 bg-background/85 px-0"
>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
    onclick={() => onNavigate(property, prevKeyframe)}
    disabled={disabled || prevKeyframe === null || !canNavigate}
    title={previousLabel}
    aria-label={previousLabel}
  >
    <ChevronLeft class="h-[9px] w-[9px]" />
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class={cn(
      'h-5 w-5 p-0 hover:bg-transparent',
      hasKeyframeAtCurrentFrame
        ? 'text-neutral-200 hover:text-neutral-200'
        : 'text-muted-foreground hover:text-foreground',
      isCurrentFrameBlocked && !hasKeyframeAtCurrentFrame && 'opacity-40 cursor-not-allowed',
    )}
    onclick={() => onToggleKeyframe(property, currentKeyframes)}
    disabled={disabled ||
      rowLocked ||
      (!hasKeyframeAtCurrentFrame && (isCurrentFrameBlocked || !canAddKeyframe))}
    title={toggleLabel}
    aria-label={toggleLabel}
  >
    <span
      class={cn(
        'block h-[7px] w-[7px] rotate-45 border transition-colors',
        hasKeyframeAtCurrentFrame
          ? 'border-neutral-200 bg-neutral-200'
          : 'border-current bg-transparent',
      )}
    ></span>
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
    onclick={() => onNavigate(property, nextKeyframe)}
    disabled={disabled || nextKeyframe === null || !canNavigate}
    title={nextLabel}
    aria-label={nextLabel}
  >
    <ChevronRight class="h-[9px] w-[9px]" />
  </Button>
</div>
