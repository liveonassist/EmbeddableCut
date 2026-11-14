<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TextMotionSlot } from '@/types/text-motion'
  import type { TimelineItem } from '@/types/timeline'
  import type { CanvasSettings } from '@/types/transform'
  import { getTextMotionPreset } from '@/shared/typography/text-motion'
  import AppliedContinuousMotionControls from './applied-continuous-motion-controls.svelte'
  import AppliedMotionRow from './applied-motion-row.svelte'
  import type { KeyframeApplicationSummary, ManualKeyframeSummary } from './motion-clip-summary'
  import type { ActiveTextMotionEntry } from './types'

  interface AppliedMotionSummaryProps {
    /** `panel` is the sidebar section; `edit` is the clip-level card. */
    variant: 'panel' | 'edit'
    manualKeyframeSummary: ManualKeyframeSummary
    /** Trimmed-out keyframes (edit variant only; the panel hides them). */
    trimmedKeyframeCount: number
    keyframeApplications: KeyframeApplicationSummary[]
    activeTextMotion: ActiveTextMotionEntry[]
    selectedItems: TimelineItem[]
    canvas: CanvasSettings
    onRemoveManualKeyframes: () => void
    onTrimAnimation: () => void
    onRemovePresetApplication: (applicationId: string) => void
    onNavigateToItemFrame: (frame: number) => void
    onRemoveTextMotion: (slot: TextMotionSlot) => void
    onNavigateToTextMotion: (slot: TextMotionSlot) => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /**
   * "Applied to this clip" summary — manual keyframes, generated keyframe
   * applications, live modulators and text motion, each removable. Shared by the
   * Motion sidebar and the Edit panel's compact card, so the two surfaces cannot
   * drift apart.
   */
  let {
    variant,
    manualKeyframeSummary,
    trimmedKeyframeCount,
    keyframeApplications,
    activeTextMotion,
    selectedItems,
    canvas,
    onRemoveManualKeyframes,
    onTrimAnimation,
    onRemovePresetApplication,
    onNavigateToItemFrame,
    onRemoveTextMotion,
    onNavigateToTextMotion,
    t,
  }: AppliedMotionSummaryProps = $props()

  const edit = $derived(variant === 'edit')
</script>

{#snippet rows()}
  {#if manualKeyframeSummary.keyframeCount > 0}
    <AppliedMotionRow
      label={t('editor.animateStages.manualKeyframes')}
      detail={`${manualKeyframeSummary.properties.join(', ')} · ${t('editor.animateStages.keyframeCount', { count: manualKeyframeSummary.keyframeCount })}`}
      removeLabel={t('editor.animateStages.removeManualKeyframes')}
      onRemove={onRemoveManualKeyframes}
      onNavigate={manualKeyframeSummary.firstFrame === null
        ? undefined
        : () => onNavigateToItemFrame(manualKeyframeSummary.firstFrame ?? 0)}
    />
  {/if}
  {#if edit && trimmedKeyframeCount > 0}
    <AppliedMotionRow
      label={t('timeline.keyframeEditor.trimmedKeyframesLabel')}
      detail={t('timeline.keyframeEditor.trimmedKeyframesDetail', {
        count: trimmedKeyframeCount,
      })}
      removeLabel={t('timeline.keyframeEditor.trimAnimation')}
      onRemove={onTrimAnimation}
    />
  {/if}
  {#each keyframeApplications as application (application.source.applicationId)}
    <AppliedMotionRow
      label={application.source.presetName}
      detail={edit
        ? `${t('editor.animateStages.generatedKeyframes')} · ${t('editor.animateStages.keyframeCount', { count: application.keyframeCount })}`
        : `${t('editor.animateStages.generatedKeyframes')} · ${[...application.properties].join(', ')} · ${t('editor.animateStages.keyframeCount', { count: application.keyframeCount })}`}
      removeLabel={t('editor.animateStages.removePresetApplication', {
        name: application.source.presetName,
      })}
      onRemove={() => onRemovePresetApplication(application.source.applicationId)}
      onNavigate={() => onNavigateToItemFrame(application.firstFrame)}
    />
  {/each}
  <AppliedContinuousMotionControls items={selectedItems} {canvas} variant="rows" showBakeAction={edit} />
  {#each activeTextMotion as { slot, effect } (slot)}
    <AppliedMotionRow
      label={t(getTextMotionPreset(effect.presetId).labelKey)}
      detail={`${t('editor.animateStages.scopeText')} · ${t(`textMotion.slots.${slot}`)} · ${t('editor.animateStages.liveBadge')}`}
      removeLabel={t('textMotion.removePreset', {
        name: t(getTextMotionPreset(effect.presetId).labelKey),
      })}
      onRemove={() => onRemoveTextMotion(slot)}
      onNavigate={() => onNavigateToTextMotion(slot)}
    />
  {/each}
{/snippet}

{#if edit}
  <section class="flex flex-col gap-2">
    <div>
      <h3 class="text-xs font-medium">{t('editor.animateStages.appliedTitle')}</h3>
      <p class="mt-0.5 text-[10px] text-muted-foreground">
        {t('editor.editAnimation.appliedHint')}
      </p>
    </div>
    <div class="flex flex-col gap-1 rounded-md border border-border/60 bg-secondary/20 p-2">
      {@render rows()}
    </div>
  </section>
{:else}
  <section class="flex flex-col gap-2 rounded-md border border-border/60 bg-secondary/20 p-2">
    <span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {t('editor.animateStages.appliedTitle')}
    </span>
    <div class="flex flex-col gap-1">{@render rows()}</div>
  </section>
{/if}
