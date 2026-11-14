<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TextItem } from '@/types/timeline'
  import {
    MOTION_PRESET_CATEGORIES,
    type MotionPreset,
    type MotionPresetCategory,
  } from '@/features/editor/deps/keyframes'
  import TextMotionSlotRows from '../text-motion/text-motion-slot-rows.svelte'
  import { TEXT_SLOT_BY_MOTION_CATEGORY } from './animation-preset-catalogue'
  import MotionPresetSection from './motion-preset-section.svelte'
  import StageSection from './stage-section.svelte'

  interface MotionPresetStagesProps {
    /** Built-in presets per category, already filtered by search / compatibility. */
    presetsByCategory: Record<MotionPresetCategory, MotionPreset[]>
    selectedTextItems: TextItem[]
    /** Deferred search query handed to the text-motion rows. */
    query: string
    reasonFor: (preset: MotionPreset) => string | null
    onApply: (preset: MotionPreset) => void
    t: (key: string, options?: Record<string, unknown>) => string
  }

  /**
   * One collapsible stage per preset category: the built-in presets as an icon
   * grid, plus the matching text-motion slot when text is selected. Categories
   * that end up empty (filtered out, or text-less for a text-only slot) render
   * nothing, so filtering never leaves an empty stage behind.
   */
  let { presetsByCategory, selectedTextItems, query, reasonFor, onApply, t }: MotionPresetStagesProps =
    $props()
</script>

{#each MOTION_PRESET_CATEGORIES as category (category)}
  {@const textSlot = TEXT_SLOT_BY_MOTION_CATEGORY[category]}
  {@const layerPresets = presetsByCategory[category]}
  {@const showTextScope = selectedTextItems.length > 0 && textSlot}
  {#if layerPresets.length > 0 || showTextScope}
    <StageSection title={t(`editor.motionPresets.categories.${category}`)}>
      {#if layerPresets.length > 0}
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-medium text-muted-foreground">
            {t('editor.animateStages.scopeLayer')}
          </span>
          <MotionPresetSection {category} presets={layerPresets} {reasonFor} {onApply} showHeading={false} {t} />
        </div>
      {/if}
      {#if showTextScope && textSlot}
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] font-medium text-muted-foreground">
            {t('editor.animateStages.scopeText')}
          </span>
          <TextMotionSlotRows
            items={selectedTextItems}
            {query}
            slots={[textSlot]}
            showSlotHeading={false}
            showEmptyState={false}
          />
        </div>
      {/if}
    </StageSection>
  {/if}
{/each}
