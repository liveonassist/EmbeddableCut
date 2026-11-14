<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import {
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { Button } from '@/components/ui/button'
  import { Input } from '@/components/ui/input'
  import { cn } from '@/shared/ui/cn'
  import { useItemsStore } from '@/features/timeline/stores/items-store'
  import { applyBentoLayout } from '@/features/timeline/stores/actions/transform-actions'
  import type { LayoutConfig } from '@/features/timeline/utils/bento-layout'
  import type { TimelineItem } from '@/types/timeline'
  import LayoutCanvas from './layout-canvas.svelte'
  import NumberInput from './number-input.svelte'
  import {
    BUILT_IN_PRESETS,
    buildChainOrder,
    type BentoPresetsState,
    type BentoTransitions,
    type SelectedPreset,
  } from './bento-layout-dialog-model'

  interface Props {
    itemIds: string[]
    transitions: BentoTransitions
    close: () => void
    customPresets: BentoPresetsState['customPresets']
    addPreset: BentoPresetsState['addPreset']
    removePreset: BentoPresetsState['removePreset']
    canvasWidth: number
    canvasHeight: number
  }

  let {
    itemIds,
    transitions,
    close,
    customPresets,
    addPreset,
    removePreset,
    canvasWidth,
    canvasHeight,
  }: Props = $props()

  const initialChainOrder = $derived(buildChainOrder(itemIds, transitions))
  let selected = $state<SelectedPreset>({ kind: 'builtin', index: 0 })
  let gap = $state(0)
  let padding = $state(0)
  /** Chain order — each entry is a chain (group of transition-connected item IDs) */
  // svelte-ignore state_referenced_locally
  let chainOrder = $state.raw<string[][]>(initialChainOrder)

  // Save preset inline state
  let isSaving = $state(false)
  let presetName = $state('')

  // Look up items from store (reactive)
  const items = select(useItemsStore, (state) => state.items)
  const itemsLookup = $derived.by(() => {
    const map = new Map<string, TimelineItem>()
    for (const id of itemIds) {
      const item = items.current.find((i) => i.id === id)
      if (item) map.set(id, item)
    }
    return map
  })

  const itemCount = $derived(itemIds.length)

  function resolveConfig(): LayoutConfig {
    if (selected.kind === 'custom') {
      const selectedId = selected.id
      const preset = customPresets.find((p) => p.id === selectedId)
      if (preset) {
        return {
          preset: preset.preset,
          cols: preset.cols,
          rows: preset.rows,
          gap: preset.gap,
          padding: preset.padding,
        }
      }
    }

    const builtin = BUILT_IN_PRESETS[selected.kind === 'builtin' ? selected.index : 0]
    if (!builtin) return { preset: 'auto', gap, padding }

    return {
      preset: builtin.type,
      cols: builtin.cols,
      rows: builtin.rows,
      gap,
      padding,
    }
  }

  const config = $derived(resolveConfig())

  function handleSwap(fromIndex: number, toIndex: number) {
    const next = [...chainOrder]
    const temp = next[fromIndex]!
    next[fromIndex] = next[toIndex]!
    next[toIndex] = temp
    chainOrder = next
  }

  function handleApply() {
    const flatIds = chainOrder.flat()
    if (flatIds.length < 2) return
    const cfg = resolveConfig()
    // Pass user's drag-swap ordered chains to preserve layout order
    applyBentoLayout(flatIds, canvasWidth, canvasHeight, cfg, chainOrder)
    close()
  }

  function handleSavePreset() {
    const layoutUnitCount = chainOrder.length
    if (!presetName.trim() || layoutUnitCount < 1) return

    const cfg = resolveConfig()
    const safeCols = cfg.cols ?? Math.max(1, Math.ceil(Math.sqrt(layoutUnitCount)))
    const safeRows = cfg.rows ?? Math.max(1, Math.ceil(layoutUnitCount / safeCols))
    addPreset({
      name: presetName.trim(),
      preset: cfg.preset,
      cols: safeCols,
      rows: safeRows,
      gap: cfg.gap ?? 0,
      padding: cfg.padding ?? 0,
    })

    presetName = ''
    isSaving = false
  }

  function handleSelectPreset(sel: SelectedPreset) {
    selected = sel
    // Reset chain order to original when switching presets
    chainOrder = initialChainOrder

    // For custom presets, also apply their gap/padding
    if (sel.kind === 'custom') {
      const preset = customPresets.find((p) => p.id === sel.id)
      if (preset) {
        gap = preset.gap
        padding = preset.padding
      }
    }
  }

  function cancelSaving() {
    isSaving = false
    presetName = ''
  }

  const presetButtonClass = (isSelected: boolean) =>
    cn(
      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
      'hover:bg-accent',
      isSelected
        ? 'ring-2 ring-primary bg-accent text-accent-foreground'
        : 'bg-muted text-muted-foreground',
    )
</script>

<DialogHeader>
  <DialogTitle>{t('timeline.bento.title')}</DialogTitle>
  <DialogDescription>
    {t('timeline.bento.description', { count: itemCount })}
  </DialogDescription>
</DialogHeader>

<!-- Preset strip -->
<div class="flex flex-wrap gap-1.5">
  {#each BUILT_IN_PRESETS as preset, idx (`${preset.type}-${idx}`)}
    <button
      onclick={() => handleSelectPreset({ kind: 'builtin', index: idx })}
      class={presetButtonClass(selected.kind === 'builtin' && selected.index === idx)}
    >
      {t(preset.labelKey)}
    </button>
  {/each}
  {#each customPresets as preset (preset.id)}
    {@const isSelected = selected.kind === 'custom' && selected.id === preset.id}
    <div class="relative group">
      <button
        onclick={() => handleSelectPreset({ kind: 'custom', id: preset.id })}
        class={presetButtonClass(isSelected)}
      >
        {preset.name}
      </button>
      <button
        onclick={(e) => {
          e.stopPropagation()
          removePreset(preset.id)
          if (isSelected) {
            selected = { kind: 'builtin', index: 0 }
          }
        }}
        class="absolute -top-1.5 -right-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
      >
        <X class="h-2.5 w-2.5" />
      </button>
    </div>
  {/each}
</div>

<!-- Interactive canvas -->
<LayoutCanvas
  {chainOrder}
  onSwap={handleSwap}
  {canvasWidth}
  {canvasHeight}
  {config}
  {itemsLookup}
/>

<!-- Options bar -->
<div class="flex items-center gap-4">
  <NumberInput
    label={t('timeline.bento.gap')}
    value={gap}
    onChange={(v) => (gap = v)}
    min={0}
    max={200}
  />
  <NumberInput
    label={t('timeline.bento.padding')}
    value={padding}
    onChange={(v) => (padding = v)}
    min={0}
    max={200}
  />
</div>

<!-- Save preset inline -->
{#if isSaving}
  <div class="flex items-center gap-2">
    <!-- svelte-ignore a11y_autofocus -->
    <Input
      placeholder={t('timeline.bento.presetNamePlaceholder')}
      bind:value={presetName}
      onkeydown={(e) => {
        if (e.key === 'Enter') handleSavePreset()
        if (e.key === 'Escape') cancelSaving()
      }}
      class="h-8 text-sm flex-1"
      autofocus
    />
    <Button size="sm" variant="secondary" onclick={handleSavePreset} disabled={!presetName.trim()}>
      {t('common.save')}
    </Button>
    <Button size="sm" variant="ghost" onclick={cancelSaving}>
      {t('common.cancel')}
    </Button>
  </div>
{/if}

<DialogFooter class="flex-row justify-between sm:justify-between">
  {#if !isSaving}
    <Button variant="secondary" size="sm" onclick={() => (isSaving = true)}>
      {t('timeline.bento.saveAsPreset')}
    </Button>
  {:else}
    <div></div>
  {/if}
  <div class="flex gap-2">
    <Button variant="ghost" onclick={close}>
      {t('common.cancel')}
    </Button>
    <Button onclick={handleApply}>{t('timeline.bento.apply')}</Button>
  </div>
</DialogFooter>
