<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type {
    TextMotionEffect,
    TextMotionEffectBase,
    TextMotionOrder,
    TextMotionSlot,
    TextMotionUnit,
  } from '@/types/text-motion'
  import {
    TEXT_MOTION_IN_PRESETS,
    TEXT_MOTION_LOOP_PRESETS,
    TEXT_MOTION_OUT_PRESETS,
    type TextMotionPreset,
  } from '@/shared/typography/text-motion'

  const SLOTS: readonly TextMotionSlot[] = ['in', 'out', 'loop']

  const PRESETS_BY_SLOT: Record<TextMotionSlot, readonly TextMotionPreset[]> = {
    in: TEXT_MOTION_IN_PRESETS,
    out: TEXT_MOTION_OUT_PRESETS,
    loop: TEXT_MOTION_LOOP_PRESETS,
  }

  const ORDER_OPTIONS: readonly TextMotionOrder[] = ['forward', 'backward', 'center', 'random']
  const UNIT_OPTIONS: readonly TextMotionUnit[] = ['character', 'word', 'line', 'whole-clip']
</script>

<script lang="ts">
  import X from 'lucide-svelte/icons/x'
  import { t } from '$lib/i18n.svelte'
  import type { TextItem } from '@/types/timeline'
  import { createTextMotionEffect, getTextMotionPreset } from '@/shared/typography/text-motion'
  import { cn } from '@/shared/ui/cn'
  import { PropertyGroupHeader, SliderInput } from '@/shared/ui/property-controls'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import {
    applyTextMotionEffect,
    beginTextMotionEdit,
    commitTextMotionEdit,
    removeTextMotionEffect,
    updateTextMotionLive,
  } from '@/features/editor/deps/timeline-store'
  import { matchesAnimationPresetQuery } from '../animate-workspace/animation-preset-filter'

  interface TextMotionSlotRowsProps {
    /** Selected text items (callers filter the selection to `type === 'text'`). */
    items: TextItem[]
    /** Optional preset-browser query used by the Motion library. */
    query?: string
    /** Limit the shared catalog to specific intent slots. */
    slots?: readonly TextMotionSlot[]
    /** Hide the repeated In/Out/Loop label when the parent stage already names it. */
    showSlotHeading?: boolean
    /** Let embedded intent stages defer the no-results message to the library. */
    showEmptyState?: boolean
  }

  /**
   * The three motion-text slot rows (In / Out / Loop) — the single shared
   * implementation behind both the text properties panel and the Animate
   * workspace Text stage. Reads the active effects off the FIRST selected text
   * item (panel convention for mixed selections) and writes to every selected
   * text item through the undoable text-motion actions.
   */
  let {
    items,
    query = '',
    slots = SLOTS,
    showSlotHeading = true,
    showEmptyState = true,
  }: TextMotionSlotRowsProps = $props()

  const itemIds = $derived(items.map((item) => item.id))
  const firstSpec = $derived(items[0]?.textMotion)
  const filteredPresetsBySlot = $derived.by(() => {
    const filterSlot = (slot: TextMotionSlot) =>
      PRESETS_BY_SLOT[slot].filter(
        (preset) =>
          firstSpec?.[slot]?.presetId === preset.id ||
          matchesAnimationPresetQuery(t(preset.labelKey), query),
      )

    return {
      in: filterSlot('in'),
      out: filterSlot('out'),
      loop: filterSlot('loop'),
    }
  })
  const visiblePresetCount = $derived(
    slots.reduce((count, slot) => count + filteredPresetsBySlot[slot].length, 0),
  )

  // One coalesced undo per slider drag: snapshot on the first live change,
  // commit on release. A direct commit (select change, typed value) snapshots
  // and commits in one shot. Gestures never overlap, so a single value suffices.
  let edit: ReturnType<typeof beginTextMotionEdit> | null = null

  function handleApply(slot: TextMotionSlot, preset: TextMotionPreset) {
    applyTextMotionEffect(itemIds, slot, createTextMotionEffect(preset.id))
  }

  function handleRemove(slot: TextMotionSlot) {
    removeTextMotionEffect(itemIds, slot)
  }

  function handleLiveEdit(slot: TextMotionSlot, partial: Partial<TextMotionEffectBase>) {
    if (!edit) edit = beginTextMotionEdit()
    updateTextMotionLive(itemIds, slot, partial)
  }

  function handleCommitEdit(slot: TextMotionSlot, partial: Partial<TextMotionEffectBase>) {
    const before = edit ?? beginTextMotionEdit()
    edit = null
    updateTextMotionLive(itemIds, slot, partial)
    commitTextMotionEdit(before, { slot, itemIds })
  }
</script>

<!--
  One motion slot (In / Out / Loop): a chip grid of that slot's presets plus,
  when a preset is active, its parameter controls. Clicking a chip applies the
  preset with catalog defaults (replacing whatever occupied the slot);
  clicking the active chip (or its ✕) removes it — CapCut-style toggle. The
  sliders tune the LIVE effect on the clip via the begin/live/commit gesture
  pattern (one undo per drag), mirroring ContinuousMotionRow.
-->
{#snippet slotRow(
  slot: TextMotionSlot,
  presets: readonly TextMotionPreset[],
  effect: TextMotionEffect | undefined,
)}
  <div class="flex flex-col gap-1.5">
    {#if showSlotHeading}
      <PropertyGroupHeader>{t(`textMotion.slots.${slot}`)}</PropertyGroupHeader>
    {/if}
    <div class="grid grid-cols-4 gap-1">
      {#each presets as preset (preset.id)}
        {@const label = t(preset.labelKey)}
        {@const isActive = effect?.presetId === preset.id}
        <button
          type="button"
          aria-pressed={isActive}
          aria-label={isActive ? t('textMotion.removePreset', { name: label }) : label}
          title={label}
          onclick={() => (isActive ? handleRemove(slot) : handleApply(slot, preset))}
          class={cn(
            'relative truncate rounded-md border px-1 py-1.5 text-[10px] leading-tight',
            isActive
              ? 'border-primary/60 bg-secondary/40 pr-4 text-foreground'
              : 'border-border/60 text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
          )}
        >
          {label}
          {#if isActive}
            <X class="absolute right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
          {/if}
        </button>
      {/each}
    </div>

    {#if effect}
      <div class="flex flex-col gap-1.5 rounded-md border border-border/60 bg-secondary/20 p-2">
        <SliderInput
          label={t('textMotion.duration')}
          value={effect.durationFrames}
          min={1}
          max={90}
          step={1}
          formatValue={(v) => `${Math.round(v)}f`}
          onChange={(v) => handleCommitEdit(slot, { durationFrames: Math.round(v) })}
          onLiveChange={(v) => handleLiveEdit(slot, { durationFrames: Math.round(v) })}
        />
        <SliderInput
          label={t('textMotion.stagger')}
          value={effect.staggerFrames}
          min={0}
          max={30}
          step={1}
          formatValue={(v) => `${Math.round(v)}f`}
          onChange={(v) => handleCommitEdit(slot, { staggerFrames: Math.round(v) })}
          onLiveChange={(v) => handleLiveEdit(slot, { staggerFrames: Math.round(v) })}
        />
        <SliderInput
          label={t('textMotion.intensity')}
          value={effect.intensity}
          min={0}
          max={2}
          step={0.05}
          formatValue={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => handleCommitEdit(slot, { intensity: v })}
          onLiveChange={(v) => handleLiveEdit(slot, { intensity: v })}
        />
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] text-muted-foreground">{t('textMotion.unit')}</span>
          <Select
            value={effect.unit ?? getTextMotionPreset(effect.presetId).unit}
            onValueChange={(value) => handleCommitEdit(slot, { unit: value as TextMotionUnit })}
          >
            <SelectTrigger class="h-6 w-32 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {#each UNIT_OPTIONS as unit (unit)}
                <SelectItem value={unit} class="text-xs">
                  {t(`textMotion.units.${unit}`)}
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] text-muted-foreground">{t('textMotion.order')}</span>
          <Select
            value={effect.order}
            onValueChange={(value) => handleCommitEdit(slot, { order: value as TextMotionOrder })}
          >
            <SelectTrigger class="h-6 w-32 text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {#each ORDER_OPTIONS as order (order)}
                <SelectItem value={order} class="text-xs">
                  {t(`textMotion.orders.${order}`)}
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#if items.length > 0}
  {#if visiblePresetCount === 0}
    {#if showEmptyState}
      <p class="py-3 text-center text-xs text-muted-foreground" role="status">
        {t('editor.animatePresets.noMatches')}
      </p>
    {/if}
  {:else}
    <div class="flex flex-col gap-3">
      {#each slots as slot (slot)}
        {#if filteredPresetsBySlot[slot].length > 0}
          {@render slotRow(slot, filteredPresetsBySlot[slot], firstSpec?.[slot])}
        {/if}
      {/each}
    </div>
  {/if}
{/if}
