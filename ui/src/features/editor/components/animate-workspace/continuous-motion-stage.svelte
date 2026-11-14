<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles'
  import type { MotionModifierType } from '@/types/motion'
  import type { TextItem } from '@/types/timeline'
  import { Button } from '@/components/ui/button'
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
  import type { getMotionModifierSettings, MotionModulator } from '@/features/editor/deps/keyframes'
  import TextMotionSlotRows from '../text-motion/text-motion-slot-rows.svelte'
  import ContinuousMotionRow from './continuous-motion-row.svelte'
  import StageSection from './stage-section.svelte'
  import type { ModifierEditSettings } from './types'

  interface ContinuousMotionStageProps {
    /** Live generators matching the current search / compatibility filters. */
    modulators: MotionModulator[]
    /** Generators already applied to every selected clip. */
    activeModulatorIds: ReadonlySet<string>
    /** Live settings of the applied generators, keyed by type. */
    settingsByModulator: ReadonlyMap<MotionModifierType, ReturnType<typeof getMotionModifierSettings>>
    selectedTextItems: TextItem[]
    /** Deferred search query handed to the text-motion rows. */
    query: string
    reasonFor: (modulator: MotionModulator) => string | null
    onApplyModulator: (modulator: MotionModulator) => void
    onRemoveModulator: (modulator: MotionModulator) => void
    onLiveEdit: (type: MotionModifierType, settings: ModifierEditSettings) => void
    onCommitEdit: (type: MotionModifierType, settings: ModifierEditSettings) => void
    hasBakeableMotion: boolean
    onOpenBakeDialog: () => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /**
   * "Layer behaviours" stage: the live motion generators as tiles, the bake
   * bridge, and the text loop rows that share the same intent. Hidden entirely
   * when neither applies to the current selection.
   */
  let {
    modulators,
    activeModulatorIds,
    settingsByModulator,
    selectedTextItems,
    query,
    reasonFor,
    onApplyModulator,
    onRemoveModulator,
    onLiveEdit,
    onCommitEdit,
    hasBakeableMotion,
    onOpenBakeDialog,
    t,
  }: ContinuousMotionStageProps = $props()
</script>

{#if modulators.length > 0 || selectedTextItems.length > 0}
  <StageSection
    title={t('editor.animateStages.continuousTitle')}
    hint={t('editor.animateStages.continuousHint')}
    defaultOpen={false}
  >
    {#if modulators.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-medium text-muted-foreground">
          {t('editor.animateStages.scopeLayer')}
        </span>
        <div class="grid grid-cols-3 gap-1.5">
          {#each modulators as modulator (modulator.id)}
            <ContinuousMotionRow
              {modulator}
              active={activeModulatorIds.has(modulator.id)}
              reason={reasonFor(modulator)}
              settings={settingsByModulator.get(modulator.id) ?? null}
              onApply={() => onApplyModulator(modulator)}
              onRemove={() => onRemoveModulator(modulator)}
              onLiveEdit={(settings) => onLiveEdit(modulator.id, settings)}
              onCommitEdit={(settings) => onCommitEdit(modulator.id, settings)}
              {t}
            />
          {/each}
        </div>

        <Tooltip>
          <TooltipTrigger>
            {#snippet child({ props })}
              <span {...props}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="h-7 w-full justify-start gap-1.5 px-2 text-[11px]"
                  disabled={!hasBakeableMotion}
                  onclick={onOpenBakeDialog}
                >
                  <WandSparkles class="h-3.5 w-3.5" />
                  {t('editor.motionGenerator.bakeToKeyframes')}
                </Button>
              </span>
            {/snippet}
          </TooltipTrigger>
          <TooltipContent>
            {t('editor.motionGenerator.bakeToKeyframesHint')}
          </TooltipContent>
        </Tooltip>
      </div>
    {/if}
    {#if selectedTextItems.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-[10px] font-medium text-muted-foreground">
          {t('editor.animateStages.scopeText')}
        </span>
        <TextMotionSlotRows
          items={selectedTextItems}
          {query}
          slots={['loop']}
          showSlotHeading={false}
          showEmptyState={false}
        />
      </div>
    {/if}
  </StageSection>
{/if}
