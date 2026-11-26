<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TimelineItem } from '@/types/timeline'
  import type { ItemEffect, GpuEffect } from '@/types/effects'
  import type { GradeClipboardEntry } from '@/shared/state/grade-clipboard'
  import { isColorGradeEffectType } from '@/infrastructure/gpu-effects'

  type GradeEffectType = 'gpu-color-wheels' | 'gpu-curves'
  type EffectParams = Record<string, number | boolean | string>

  const GRADE_EFFECT_TYPES: readonly GradeEffectType[] = ['gpu-color-wheels', 'gpu-curves']

  function syntheticGradeId(type: GradeEffectType): string {
    return `__grade:${type}__`
  }

  function findGradeEntry(item: TimelineItem, type: GradeEffectType): ItemEffect | undefined {
    return (item.effects ?? []).find(
      (entry) => entry.effect.type === 'gpu-effect' && entry.effect.gpuEffectType === type,
    )
  }

  function isColorGradeEntry(entry: ItemEffect): boolean {
    return entry.effect.type === 'gpu-effect' && isColorGradeEffectType(entry.effect.gpuEffectType)
  }

  function itemHasGrade(item: TimelineItem): boolean {
    return (item.effects ?? []).some(isColorGradeEntry)
  }

  function itemHasEnabledGrade(item: TimelineItem): boolean {
    return (item.effects ?? []).some((entry) => entry.enabled && isColorGradeEntry(entry))
  }

  function cloneGpuEffect(effect: GpuEffect): GpuEffect {
    return { ...effect, params: { ...effect.params } }
  }

  function copyGradeEntries(item: TimelineItem): GradeClipboardEntry[] {
    return (item.effects ?? []).filter(isColorGradeEntry).map((entry) => ({
      effect: cloneGpuEffect(entry.effect),
      enabled: entry.enabled,
    }))
  }

  function buildPastedGradeEffects(grade: GradeClipboardEntry[]): ItemEffect[] {
    return grade.map((entry) => ({
      id: crypto.randomUUID(),
      effect: cloneGpuEffect(entry.effect),
      enabled: entry.enabled,
    }))
  }

  function replaceColorEffectsInPlace(
    effects: ItemEffect[] | undefined,
    grade: GradeClipboardEntry[],
  ): ItemEffect[] {
    const pastedEffects = buildPastedGradeEffects(grade)
    let inserted = false
    const nextEffects: ItemEffect[] = []

    for (const entry of effects ?? []) {
      if (!isColorGradeEntry(entry)) {
        nextEffects.push(entry)
        continue
      }
      if (!inserted) {
        nextEffects.push(...pastedEffects)
        inserted = true
      }
    }

    if (!inserted) {
      nextEffects.push(...pastedEffects)
    }

    return nextEffects
  }
</script>

<script lang="ts">
  import Palette from '@lucide/svelte/icons/palette'
  import CircleOff from '@lucide/svelte/icons/circle-off'
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste'
  import Columns2 from '@lucide/svelte/icons/columns-2'
  import Copy from '@lucide/svelte/icons/copy'
  import Eye from '@lucide/svelte/icons/eye'
  import Layers from '@lucide/svelte/icons/layers'
  import Save from '@lucide/svelte/icons/save'
  import X from '@lucide/svelte/icons/x'
  import type { Snippet } from 'svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import {
    addEffects,
    applyAutoKeyframeOperations,
    removeEffect,
    setItemEffects,
    toggleEffect,
    updateEffect,
  } from '@/features/effects/deps/timeline-contract'
  import { useGizmoStore, useThrottledFrame } from '@/features/effects/deps/preview-contract'
  import { useGradeClipboardStore } from '@/shared/state/grade-clipboard'
  import { PropertySection } from '@/shared/ui/property-controls'
  import { cn } from '@/shared/ui/cn'
  import { GpuWheelsPanel, GpuCurvesPanel } from './panels'
  import { getGpuEffect, getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
  import { useUserPresetsStore } from '@/features/effects/stores/user-presets-store'
  import { getAutoKeyframeOperation } from '@/features/effects/deps/keyframes-contract'
  import type { AnimatableProperty } from '@/types/keyframe'
  import { useKeyframesByItemId } from '../hooks/use-keyframes-by-item-id.svelte'
  import {
    getGpuEffectKeyframeProperty,
    getResolvedGpuEffectForFrame,
  } from '@/features/effects/utils/effect-keyframes'
  import {
    applyGradePresetToEffectStack,
    hasGradePresetEffects,
  } from '@/features/effects/utils/grade-presets'

  interface ColorGradeSectionProps {
    /** Visual items (already filtered to exclude audio) */
    items: TimelineItem[]
    /** Sidebar keeps the legacy stacked inspector; dock renders fitted color-page panes. */
    layout?: 'sidebar' | 'dock'
    /** Optional quick action: create an adjustment layer for scene-wide grading */
    onCreateAdjustmentLayer?: () => void
  }

  /**
   * DaVinci-style grade controls: color wheels and curves are always visible
   * for the selected clip — no "Add Effect" ceremony. When the clip has no
   * grade yet, the panels render at defaults and the underlying effect is
   * created lazily on the first adjustment (live drags preview through the
   * gizmo effects-preview path before the effect exists).
   */
  let { items, layout = 'sidebar', onCreateAdjustmentLayer }: ColorGradeSectionProps = $props()

  const colorGradeComparisonMode = select(useGizmoStore, (s) => s.colorGradeComparisonMode)
  const setColorGradeComparisonMode = (
    mode: ReturnType<typeof useGizmoStore.getState>['colorGradeComparisonMode'],
  ) => useGizmoStore.getState().setColorGradeComparisonMode(mode)
  const clearPreview = () => useGizmoStore.getState().clearPreview()
  const hasCopiedGrade = select(
    useGradeClipboardStore,
    (s) => s.grade !== null && s.grade.length > 0,
  )
  const currentFrame = useThrottledFrame(() => ({ updateDuringScrub: layout !== 'dock' }))

  const visualItems = $derived(items)
  const itemIds = $derived(visualItems.map((item) => item.id))
  const displayItem = $derived(visualItems[0] ?? null)
  const keyframesByItemId = useKeyframesByItemId(() => itemIds)

  // Params accumulated from live events for a grade effect that doesn't
  // exist yet (created on commit at gesture end).
  const pendingParams: Partial<Record<GradeEffectType, EffectParams>> = {}

  const displayEntries = $derived.by(() => {
    const entries = {} as Record<GradeEffectType, ItemEffect>
    for (const type of GRADE_EFFECT_TYPES) {
      const existing = displayItem ? findGradeEntry(displayItem, type) : undefined
      entries[type] =
        existing ??
        ({
          id: syntheticGradeId(type),
          enabled: true,
          effect: {
            type: 'gpu-effect',
            gpuEffectType: type,
            params: getGpuEffectDefaultParams(type),
          },
        } satisfies ItemEffect)
    }
    return entries
  })

  const resolveGradeType = (effectId: string): GradeEffectType | null => {
    for (const type of GRADE_EFFECT_TYPES) {
      if (displayEntries[type].id === effectId) return type
    }
    return null
  }

  // Commit param updates: update existing grade effects, lazily create the
  // effect (defaults + pending live params + this update) where missing.
  const commitParams = (type: GradeEffectType, updates: EffectParams) => {
    const pending = pendingParams[type]
    pendingParams[type] = undefined

    const frame = currentFrame.current
    const keyframes = keyframesByItemId.current
    const createUpdates: Array<{ itemId: string; effects: GpuEffect[] }> = []
    const autoOperations = visualItems.flatMap((item) => {
      const entry = findGradeEntry(item, type)
      if (!entry || entry.effect.type !== 'gpu-effect') return []
      const itemKeyframeState = keyframes.get(item.id) ?? undefined
      return Object.entries(updates).flatMap(([paramKey, paramValue]) => {
        if (typeof paramValue !== 'number') return []
        const property = getGpuEffectKeyframeProperty(entry, paramKey)
        const operation =
          property && getAutoKeyframeOperation(item, itemKeyframeState, property, paramValue, frame)
        return operation ? [operation] : []
      })
    })

    if (autoOperations.length > 0) {
      applyAutoKeyframeOperations(autoOperations)
    }

    visualItems.forEach((item) => {
      const entry = findGradeEntry(item, type)
      if (entry && entry.effect.type === 'gpu-effect') {
        const fallbackUpdates = { ...updates }
        for (const [paramKey, paramValue] of Object.entries(updates)) {
          const property =
            typeof paramValue === 'number' ? getGpuEffectKeyframeProperty(entry, paramKey) : null
          const autoHandled =
            property &&
            autoOperations.some(
              (operation) => operation.itemId === item.id && operation.property === property,
            )
          if (autoHandled) delete fallbackUpdates[paramKey]
        }
        if (Object.keys(fallbackUpdates).length === 0) return
        updateEffect(item.id, entry.id, {
          effect: { ...entry.effect, params: { ...entry.effect.params, ...fallbackUpdates } },
        })
        return
      }
      createUpdates.push({
        itemId: item.id,
        effects: [
          {
            type: 'gpu-effect',
            gpuEffectType: type,
            params: { ...getGpuEffectDefaultParams(type), ...pending, ...updates },
          },
        ],
      })
    })
    if (createUpdates.length > 0) {
      addEffects(createUpdates)
    }
    queueMicrotask(() => clearPreview())
  }

  // Live preview during drags. For items without the grade effect, the
  // preview list gains a synthetic entry — the gizmo preview replaces the
  // item's effects wholesale, so previewing a not-yet-created effect works.
  const liveParams = (type: GradeEffectType, updates: EffectParams) => {
    pendingParams[type] = { ...pendingParams[type], ...updates }
    const previews: Record<string, ItemEffect[]> = {}
    visualItems.forEach((item) => {
      const entry = findGradeEntry(item, type)
      if (entry && entry.effect.type === 'gpu-effect') {
        previews[item.id] = (item.effects ?? []).map((candidate) =>
          candidate.id === entry.id && candidate.effect.type === 'gpu-effect'
            ? {
                ...candidate,
                effect: {
                  ...candidate.effect,
                  params: { ...candidate.effect.params, ...updates },
                },
              }
            : candidate,
        )
        return
      }
      previews[item.id] = [
        ...(item.effects ?? []),
        {
          id: syntheticGradeId(type),
          enabled: true,
          effect: {
            type: 'gpu-effect',
            gpuEffectType: type,
            params: { ...getGpuEffectDefaultParams(type), ...pendingParams[type] },
          },
        },
      ]
    })
    useGizmoStore.getState().setEffectsPreviewNew(previews)
  }

  const handleParamChange = (
    effectId: string,
    paramKey: string,
    value: number | boolean | string,
  ) => {
    const type = resolveGradeType(effectId)
    if (type) commitParams(type, { [paramKey]: value })
  }

  const handleParamsBatchChange = (effectId: string, updates: EffectParams) => {
    const type = resolveGradeType(effectId)
    if (type) commitParams(type, updates)
  }

  const handleParamLiveChange = (
    effectId: string,
    paramKey: string,
    value: number | boolean | string,
  ) => {
    const type = resolveGradeType(effectId)
    if (type) liveParams(type, { [paramKey]: value })
  }

  const handleParamsBatchLiveChange = (effectId: string, updates: EffectParams) => {
    const type = resolveGradeType(effectId)
    if (type) liveParams(type, updates)
  }

  const handleReset = (effectId: string) => {
    const type = resolveGradeType(effectId)
    if (!type) return
    pendingParams[type] = undefined
    visualItems.forEach((item) => {
      const entry = findGradeEntry(item, type)
      if (entry && entry.effect.type === 'gpu-effect') {
        updateEffect(item.id, entry.id, {
          effect: { ...entry.effect, params: getGpuEffectDefaultParams(type) },
        })
      }
    })
    queueMicrotask(() => clearPreview())
  }

  const handleToggle = (effectId: string) => {
    const type = resolveGradeType(effectId)
    if (!type) return
    visualItems.forEach((item) => {
      const entry = findGradeEntry(item, type)
      if (entry) toggleEffect(item.id, entry.id)
    })
  }

  const handleRemove = (effectId: string) => {
    const type = resolveGradeType(effectId)
    if (!type) return
    pendingParams[type] = undefined
    visualItems.forEach((item) => {
      const entry = findGradeEntry(item, type)
      if (entry) removeEffect(item.id, entry.id)
    })
  }

  const getKeyframeProperty = (effectId: string, paramKey: string): AnimatableProperty | null => {
    if (effectId.startsWith('__grade:')) return null
    const entry = Object.values(displayEntries).find((candidate) => candidate.id === effectId)
    return entry ? getGpuEffectKeyframeProperty(entry, paramKey) : null
  }

  // Save the display item's current grade (its color-category effects) as a
  // named preset in the workspace.
  const userPresets = select(useUserPresetsStore, (s) => s.presets)
  let presetNameDraft = $state<string | null>(null)
  const gradeEffects = $derived(
    (displayItem?.effects ?? [])
      .filter(
        (entry) =>
          entry.enabled &&
          entry.effect.type === 'gpu-effect' &&
          isColorGradeEffectType(entry.effect.gpuEffectType),
      )
      .map((entry) => entry.effect),
  )
  const canCopyGrade = $derived(visualItems.some(itemHasGrade))
  const canCompareGrade = $derived(visualItems.some(itemHasEnabledGrade))
  const gradePresets = $derived(
    userPresets.current.filter((preset) => hasGradePresetEffects(preset.effects)),
  )

  $effect(() => {
    void useUserPresetsStore.getState().loadPresets()
  })

  $effect(() => {
    if (colorGradeComparisonMode.current === 'split' && !canCompareGrade) {
      setColorGradeComparisonMode('off')
    }
  })

  const handleSavePreset = () => {
    const name = presetNameDraft?.trim()
    if (!name || gradeEffects.length === 0) return
    void useUserPresetsStore.getState().addPreset(name, gradeEffects)
    presetNameDraft = null
  }

  const handleApplyGradePreset = (presetId: string) => {
    const preset = useUserPresetsStore
      .getState()
      .presets.find((candidate) => candidate.id === presetId)
    if (!preset || !hasGradePresetEffects(preset.effects)) return
    setItemEffects(
      visualItems.map((item) => ({
        itemId: item.id,
        effects: applyGradePresetToEffectStack(item.effects, preset.effects),
      })),
    )
    queueMicrotask(() => clearPreview())
  }

  const handleCopyGrade = () => {
    const sourceItem = visualItems.find(itemHasGrade)
    if (!sourceItem) return
    const grade = copyGradeEntries(sourceItem)
    if (grade.length === 0) return
    useGradeClipboardStore.getState().setGrade(grade)
  }

  const handlePasteGrade = () => {
    const grade = useGradeClipboardStore.getState().grade
    if (!grade || grade.length === 0) return
    setItemEffects(
      visualItems.map((item) => ({
        itemId: item.id,
        effects: replaceColorEffectsInPlace(item.effects, grade),
      })),
    )
    queueMicrotask(() => clearPreview())
  }

  const wheelsDefinition = getGpuEffect('gpu-color-wheels')
  const curvesDefinition = getGpuEffect('gpu-curves')
  const savePresetLabel = $derived(t('effects.colorPanel.savePresetTooltip'))

  const wheelsEntry = $derived(displayEntries['gpu-color-wheels'])
  const curvesEntry = $derived(displayEntries['gpu-curves'])
  const displayKeyframes = $derived(
    displayItem ? (keyframesByItemId.current.get(displayItem.id) ?? undefined) : undefined,
  )
  const wheelsGpuEffect = $derived(
    getResolvedGpuEffectForFrame(wheelsEntry, displayItem, displayKeyframes, currentFrame.current),
  )
  const curvesGpuEffect = $derived(
    getResolvedGpuEffectForFrame(curvesEntry, displayItem, displayKeyframes, currentFrame.current),
  )
  const splitCompareTitle = $derived(
    canCompareGrade
      ? t('effects.colorPanel.compareSplitTooltip')
      : t('effects.colorPanel.compareSplitDisabledTooltip'),
  )
</script>

{#snippet dockPane(className: string | undefined, children: Snippet)}
  <section class={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
    <div class="min-h-0 flex-1 overflow-hidden">{@render children()}</div>
  </section>
{/snippet}

{#snippet compareControls()}
  <div class="grid grid-cols-3 gap-1" role="group" aria-label={t('effects.colorPanel.compareMode')}>
    <Button
      variant={colorGradeComparisonMode.current === 'off' ? 'default' : 'outline'}
      size="sm"
      class="h-7 px-1 text-xs"
      onclick={() => setColorGradeComparisonMode('off')}
      title={t('effects.colorPanel.compareAfterTooltip')}
      aria-label={t('effects.colorPanel.compareAfterTooltip')}
      aria-pressed={colorGradeComparisonMode.current === 'off'}
    >
      <Eye class="mr-1 h-3 w-3" />
      {t('effects.colorPanel.compareAfter')}
    </Button>
    <Button
      variant={colorGradeComparisonMode.current === 'before' ? 'default' : 'outline'}
      size="sm"
      class="h-7 px-1 text-xs"
      onclick={() => setColorGradeComparisonMode('before')}
      title={t('effects.colorPanel.compareBeforeTooltip')}
      aria-label={t('effects.colorPanel.compareBeforeTooltip')}
      aria-pressed={colorGradeComparisonMode.current === 'before'}
    >
      <CircleOff class="mr-1 h-3 w-3" />
      {t('effects.colorPanel.compareBefore')}
    </Button>
    <Button
      variant={colorGradeComparisonMode.current === 'split' ? 'default' : 'outline'}
      size="sm"
      class="h-7 px-1 text-xs"
      onclick={() => setColorGradeComparisonMode('split')}
      disabled={!canCompareGrade}
      title={splitCompareTitle}
      aria-label={splitCompareTitle}
      aria-pressed={colorGradeComparisonMode.current === 'split'}
    >
      <Columns2 class="mr-1 h-3 w-3" />
      {t('effects.colorPanel.compareSplit')}
    </Button>
  </div>
{/snippet}

{#snippet gradeActions()}
  <div class="flex flex-wrap gap-1">
    <Button
      variant="outline"
      size="sm"
      class="h-7 min-w-[5.75rem] flex-1 text-xs"
      onclick={handleCopyGrade}
      disabled={!canCopyGrade}
      title={t('timeline.contextMenu.copyGrade')}
    >
      <Copy class="mr-1 h-3 w-3" />
      {t('timeline.contextMenu.copyGrade')}
    </Button>
    <Button
      variant="outline"
      size="sm"
      class="h-7 min-w-[5.75rem] flex-1 text-xs"
      onclick={handlePasteGrade}
      disabled={!hasCopiedGrade.current}
      title={t('timeline.contextMenu.pasteGrade')}
    >
      <ClipboardPaste class="mr-1 h-3 w-3" />
      {t('timeline.contextMenu.pasteGrade')}
    </Button>
    {#if onCreateAdjustmentLayer}
      <Button
        variant="outline"
        size="sm"
        class="h-7 min-w-[7.5rem] flex-1 text-xs"
        onclick={onCreateAdjustmentLayer}
        title={t('effects.colorPanel.adjustmentLayerTooltip')}
      >
        <Layers class="mr-1 h-3 w-3" />
        {t('effects.colorPanel.adjustmentLayer')}
      </Button>
    {/if}
    <Button
      variant="outline"
      size="sm"
      class="h-7 px-2"
      onclick={() => (presetNameDraft = presetNameDraft === null ? '' : null)}
      disabled={gradeEffects.length === 0}
      title={savePresetLabel}
      aria-label={savePresetLabel}
    >
      <Save class="h-3.5 w-3.5" />
    </Button>
  </div>
{/snippet}

{#snippet presetNameInput()}
  {#if presetNameDraft !== null}
    <div class="flex gap-1 px-2 pb-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="text"
        name="gradePresetName"
        autocomplete="off"
        aria-label={t('effects.colorPanel.presetNamePlaceholder')}
        value={presetNameDraft}
        oninput={(event) => (presetNameDraft = event.currentTarget.value)}
        onkeydown={(event) => {
          if (event.key === 'Enter') handleSavePreset()
          if (event.key === 'Escape') presetNameDraft = null
          event.stopPropagation()
        }}
        placeholder={t('effects.colorPanel.presetNamePlaceholder')}
        class="h-7 min-w-0 flex-1 rounded-sm border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        autofocus
      />
      <Button
        variant="default"
        size="sm"
        class="h-7 text-xs"
        onclick={handleSavePreset}
        disabled={!presetNameDraft.trim()}
      >
        {t('effects.colorPanel.savePreset')}
      </Button>
    </div>
  {/if}
{/snippet}

{#snippet gradeGallery()}
  {#if gradePresets.length > 0}
    <div class="px-2 pb-2">
      <div class="mb-1 flex items-center justify-between">
        <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('effects.colorPanel.gallery')}
        </span>
      </div>
      <div class="flex gap-1 overflow-x-auto pb-1">
        {#each gradePresets as preset (preset.id)}
          <div
            class="group relative min-w-[104px] rounded-sm border border-border/70 bg-secondary/35"
          >
            <button
              type="button"
              class="flex h-12 w-full flex-col items-start justify-between rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
              onclick={() => handleApplyGradePreset(preset.id)}
              title={t('effects.colorPanel.applyPresetTooltip', { name: preset.name })}
              aria-label={t('effects.colorPanel.applyPresetTooltip', { name: preset.name })}
            >
              <span
                class="h-1 w-full rounded-full bg-gradient-to-r from-slate-500 via-amber-300 to-sky-400"
              ></span>
              <span class="max-w-[80px] truncate text-xs font-medium">{preset.name}</span>
            </button>
            <button
              type="button"
              class="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-sm bg-black/55 text-white/80 hover:text-white focus:flex group-hover:flex group-focus-within:flex"
              onclick={(event) => {
                event.stopPropagation()
                void useUserPresetsStore.getState().removePreset(preset.id)
              }}
              title={t('effects.colorPanel.deletePresetTooltip', { name: preset.name })}
              aria-label={t('effects.colorPanel.deletePresetTooltip', { name: preset.name })}
            >
              <X class="h-3 w-3" />
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet wheelsPanel()}
  {#if wheelsDefinition}
    <GpuWheelsPanel
      {itemIds}
      effect={wheelsEntry}
      gpuEffect={wheelsGpuEffect}
      definition={wheelsDefinition}
      {layout}
      {getKeyframeProperty}
      onParamChange={handleParamChange}
      onParamLiveChange={handleParamLiveChange}
      onParamsBatchChange={handleParamsBatchChange}
      onParamsBatchLiveChange={handleParamsBatchLiveChange}
      onReset={handleReset}
      onToggle={handleToggle}
      onRemove={handleRemove}
    />
  {/if}
{/snippet}

{#snippet curvesPanel()}
  {#if curvesDefinition}
    <GpuCurvesPanel
      effect={curvesEntry}
      gpuEffect={curvesGpuEffect}
      definition={curvesDefinition}
      {layout}
      onParamChange={handleParamChange}
      onParamLiveChange={handleParamLiveChange}
      onParamsBatchChange={handleParamsBatchChange}
      onParamsBatchLiveChange={handleParamsBatchLiveChange}
      onReset={handleReset}
      onToggle={handleToggle}
      onRemove={handleRemove}
    />
  {/if}
{/snippet}

{#if visualItems.length > 0 && wheelsDefinition && curvesDefinition}
  {#if layout === 'dock'}
    <div
      class="flex h-full min-h-0 flex-col overflow-hidden rounded-[3px] border border-border/70 bg-background/35"
    >
      <div
        class="grid shrink-0 gap-2 border-b border-border/70 p-2 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.75fr)]"
      >
        {@render compareControls()}
        {@render gradeActions()}
      </div>
      {@render presetNameInput()}
      {@render gradeGallery()}
      <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1.5fr)_minmax(0,0.5fr)]">
        {@render dockPane('border-r border-border/70', wheelsPanel)}
        {@render dockPane(undefined, curvesPanel)}
      </div>
    </div>
  {:else}
    <PropertySection title={t('effects.colorPanel.title')} icon={Palette} defaultOpen={true}>
      <div class="px-2 pb-1">{@render compareControls()}</div>

      <div class="px-2 pb-2">{@render gradeActions()}</div>

      {@render presetNameInput()}

      {@render gradeGallery()}

      <div class="space-y-0">
        {@render wheelsPanel()}
        {@render curvesPanel()}
      </div>
    </PropertySection>
  {/if}
{/if}
