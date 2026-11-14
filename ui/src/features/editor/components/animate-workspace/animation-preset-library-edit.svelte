<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import ExternalLink from 'lucide-svelte/icons/external-link'
  import Layers3 from 'lucide-svelte/icons/layers-3'
  import type { TextMotionSlot } from '@/types/text-motion'
  import type { TextItem, TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import type { MotionPreset } from '@/features/editor/deps/keyframes'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
  import { cn } from '@/shared/ui/cn'
  import TextMotionSlotRows from '../text-motion/text-motion-slot-rows.svelte'
  import MotionPresetThumbnail from './motion-preset-thumbnail.svelte'
  import AppliedMotionSummary from './applied-motion-summary.svelte'
  import type { KeyframeApplicationSummary, ManualKeyframeSummary } from './motion-clip-summary'
  import type { ActiveTextMotionEntry } from './types'

  interface AnimationPresetLibraryEditProps {
    /** The compact quick-preset grid (six built-ins). */
    quickPresets: MotionPreset[]
    reasonFor: (preset: MotionPreset) => string | null
    onApplyPreset: (preset: MotionPreset) => void
    hasAnyAnimation: boolean
    manualKeyframeSummary: ManualKeyframeSummary
    trimmedKeyframeCount: number
    keyframeApplications: KeyframeApplicationSummary[]
    activeTextMotion: ActiveTextMotionEntry[]
    selectedItems: TimelineItem[]
    selectedTextItems: TextItem[]
    canvas: CanvasSettings
    onRemoveManualKeyframes: () => void
    onTrimAnimation: () => void
    onRemovePresetApplication: (applicationId: string) => void
    onNavigateToItemFrame: (frame: number) => void
    onRemoveTextMotion: (slot: TextMotionSlot) => void
    onNavigateToTextMotion: (slot: TextMotionSlot) => void
    isMotionClip: boolean
    onMotionClip: () => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /**
   * Clip-level animation surface (the Edit inspector's Motion area): the quick
   * preset grid, the applied-motion card, text-motion rows and the Motion-clip
   * bridge. The full library lives in animation-preset-library.svelte.
   */
  let {
    quickPresets,
    reasonFor,
    onApplyPreset,
    hasAnyAnimation,
    manualKeyframeSummary,
    trimmedKeyframeCount,
    keyframeApplications,
    activeTextMotion,
    selectedItems,
    selectedTextItems,
    canvas,
    onRemoveManualKeyframes,
    onTrimAnimation,
    onRemovePresetApplication,
    onNavigateToItemFrame,
    onRemoveTextMotion,
    onNavigateToTextMotion,
    isMotionClip,
    onMotionClip,
    t,
  }: AnimationPresetLibraryEditProps = $props()
</script>

<TooltipProvider delayDuration={300}>
  <div class="flex flex-col gap-4" data-testid="edit-animation-panel">
    <section class="flex flex-col gap-2">
      <div>
        <h3 class="text-xs font-medium">{t('editor.editAnimation.quickTitle')}</h3>
        <p class="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {t('editor.editAnimation.quickHint')}
        </p>
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        {#each quickPresets as preset (preset.id)}
          {@const disabledReason = reasonFor(preset)}
          {@const label = t(`editor.motionPresets.items.${preset.labelKey}`)}
          <Tooltip>
            <TooltipTrigger>
              {#snippet child({ props })}
                <button
                  {...props}
                  type="button"
                  disabled={disabledReason !== null}
                  onclick={() => onApplyPreset(preset)}
                  class={cn(
                    'group flex min-h-14 flex-col items-center gap-1 rounded-md border border-border/60 p-1.5 text-[10px]',
                    disabledReason
                      ? 'cursor-not-allowed text-muted-foreground/40'
                      : 'text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
                  )}
                >
                  <MotionPresetThumbnail thumbnail={preset.thumbnail} />
                  <span class="w-full truncate text-center">{label}</span>
                </button>
              {/snippet}
            </TooltipTrigger>
            {#if disabledReason}<TooltipContent>{disabledReason}</TooltipContent>{/if}
          </Tooltip>
        {/each}
      </div>
    </section>

    {#if hasAnyAnimation}
      <Separator />
      <AppliedMotionSummary
        variant="edit"
        {manualKeyframeSummary}
        {trimmedKeyframeCount}
        {keyframeApplications}
        {activeTextMotion}
        {selectedItems}
        {canvas}
        {onRemoveManualKeyframes}
        {onTrimAnimation}
        {onRemovePresetApplication}
        {onNavigateToItemFrame}
        {onRemoveTextMotion}
        {onNavigateToTextMotion}
        {t}
      />
    {/if}

    {#if selectedTextItems.length > 0}
      <Separator />
      <section class="flex flex-col gap-2">
        <div>
          <h3 class="text-xs font-medium">{t('textMotion.sectionTitle')}</h3>
          <p class="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            {t('editor.editAnimation.textHint')}
          </p>
        </div>
        <TextMotionSlotRows items={selectedTextItems} />
      </section>
    {/if}

    <Separator />

    <section class="rounded-md border border-border/60 bg-secondary/20 p-2.5">
      <div class="flex items-start gap-2">
        <Layers3 class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div class="min-w-0 flex-1">
          <h3 class="text-xs font-medium">{t('editor.editAnimation.motionClipTitle')}</h3>
          <p class="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            {isMotionClip
              ? t('editor.editAnimation.motionClipOpenHint')
              : t('editor.editAnimation.motionClipCreateHint')}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="mt-2 h-7 gap-1.5 px-2 text-[10px]"
            onclick={onMotionClip}
          >
            {#if isMotionClip}
              <ExternalLink class="h-3 w-3" />
            {:else}
              <Layers3 class="h-3 w-3" />
            {/if}
            {isMotionClip ? t('editor.editAnimation.openInMotion') : t('editor.editAnimation.createMotionClip')}
          </Button>
        </div>
      </div>
    </section>
  </div>
</TooltipProvider>
