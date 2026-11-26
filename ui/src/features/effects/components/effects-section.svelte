<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const EMPTY_HIDDEN_GPU_EFFECT_TYPES: readonly string[] = []
</script>

<script lang="ts">
  import { Portal } from 'bits-ui'
  import Sparkles from '@lucide/svelte/icons/sparkles'
  import Plus from '@lucide/svelte/icons/plus'
  import Eye from '@lucide/svelte/icons/eye'
  import EyeOff from '@lucide/svelte/icons/eye-off'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { portalTarget } from '$lib/context'
  import { Button } from '@/components/ui/button'
  import type { TimelineItem } from '@/types/timeline'
  import type { ItemEffect, GpuEffect, VisualEffect } from '@/types/effects'
  import { EFFECT_PRESETS } from '@/types/effects'
  import {
    addEffect,
    addEffects,
    applyAutoKeyframeOperations,
    removeEffect,
    setItemEffects,
    toggleEffect,
    updateEffect,
    useItemsStore,
  } from '@/features/effects/deps/timeline-contract'
  import {
    useGizmoStore,
    usePowerWindowEditorStore,
    useSpatialEffectEditorStore,
    useThrottledFrame,
  } from '@/features/effects/deps/preview-contract'
  import { PropertySection } from '@/shared/ui/property-controls'
  import {
    GpuEffectPanel,
    GpuWheelsPanel,
    GpuCurvesPanel,
    GpuLutPanel,
    GpuGradientMapPanel,
    GpuPowerWindowPanel,
    GpuSecondaryQualifierPanel,
  } from './panels'
  import { effectT } from './panels/panel-props'
  import { getGpuEffect, getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
  import { useGpuEffectPreviewData } from '../hooks/use-gpu-effect-preview-data.svelte'
  import EffectThumbnail from './effect-thumbnail/index.svelte'
  import { getMappedSelectionEffectEntry } from '@/features/effects/utils/effect-selection'
  import { useUserPresetsStore } from '@/features/effects/stores/user-presets-store'
  import { getAutoKeyframeOperation } from '@/features/effects/deps/keyframes-contract'
  import { buildEffectAnimatableProperty, type AnimatableProperty } from '@/types/keyframe'
  import {
    getEffectCategoryLabel,
    getEffectDefinitionName,
  } from '@/features/effects/utils/effect-i18n'
  import {
    getGpuEffectKeyframeProperty,
    getGpuEffectKeyframeValue,
    getResolvedGpuEffectForFrame,
  } from '@/features/effects/utils/effect-keyframes'
  import { useKeyframesByItemId } from '../hooks/use-keyframes-by-item-id.svelte'

  interface EffectsSectionProps {
    /** Visual items (already filtered to exclude audio) */
    items: TimelineItem[]
    /** Effect types rendered by a parent-specific control surface. */
    hiddenGpuEffectTypes?: readonly string[]
    /** Sidebar keeps the legacy inspector shell; dock fits inside the Color page lane. */
    layout?: 'sidebar' | 'dock'
    /**
     * Jump to the Color workspace. When provided, heavyweight grade panels
     * (wheels, curves) render collapsed in the sidebar with an "Edit in Color"
     * affordance instead of the full grading surface.
     */
    onEditInColor?: () => void
  }

  /**
   * Effects section - GPU shader effects for visual items.
   * Only shown when selection includes video, image, text, or shape clips.
   */
  let {
    items,
    hiddenGpuEffectTypes = EMPTY_HIDDEN_GPU_EFFECT_TYPES,
    layout = 'sidebar',
    onEditInColor,
  }: EffectsSectionProps = $props()

  const isDock = $derived(layout === 'dock')
  // Grade panels collapse to a summary row in the sidebar (the Edit workspace);
  // the dock owns the full grading surface, so it never collapses.
  const gradePanelCollapsible = $derived(!isDock)
  const currentFrame = useThrottledFrame(() => ({ updateDuringScrub: !isDock }))

  // Items are already filtered by parent - use directly
  const visualItems = $derived(items)

  const itemIds = $derived(visualItems.map((item) => item.id))
  const hiddenGpuEffectTypeSet = $derived(new Set(hiddenGpuEffectTypes))
  const isHiddenEffectEntry = (entry: ItemEffect): boolean =>
    entry.effect.type === 'gpu-effect' && hiddenGpuEffectTypeSet.has(entry.effect.gpuEffectType)
  const hasHiddenGpuEffect = (presetEffects: readonly VisualEffect[]): boolean =>
    presetEffects.some((effect) => hiddenGpuEffectTypeSet.has(effect.gpuEffectType))

  // Get effects from first selected item (for display)
  // Multi-select shows first item's effects
  const effects = $derived<ItemEffect[]>(
    (visualItems[0]?.effects ?? []).filter((entry) => !isHiddenEffectEntry(entry)),
  )
  const displayItem = $derived(visualItems[0] ?? null)
  const keyframesByItemId = useKeyframesByItemId(() => itemIds)

  const getMappedEffectEntry = (item: TimelineItem, displayEffectId: string): ItemEffect | null =>
    getMappedSelectionEffectEntry(
      effects,
      item.effects?.filter((entry) => !isHiddenEffectEntry(entry)),
      displayEffectId,
    )

  const getKeyframeProperty = (effectId: string, paramKey: string): AnimatableProperty | null => {
    const effect = effects.find((entry) => entry.id === effectId)
    return effect ? getGpuEffectKeyframeProperty(effect, paramKey) : null
  }

  const getResolvedDisplayGpuEffect = (effectEntry: ItemEffect): GpuEffect => {
    const itemKeyframeState = displayItem
      ? (keyframesByItemId.current.get(displayItem.id) ?? undefined)
      : undefined
    return getResolvedGpuEffectForFrame(
      effectEntry,
      displayItem,
      itemKeyframeState,
      currentFrame.current,
    )
  }

  // Add a GPU shader effect
  const handleAddGpuEffect = (gpuEffectId: string) => {
    const defaults = getGpuEffectDefaultParams(gpuEffectId)
    itemIds.forEach((id) => {
      addEffect(id, {
        type: 'gpu-effect',
        gpuEffectType: gpuEffectId,
        params: defaults,
      } as GpuEffect)
    })

    if (gpuEffectId === 'gpu-power-window' && itemIds.length === 1) {
      const itemId = itemIds[0]!
      const item = useItemsStore.getState().items.find((candidate) => candidate.id === itemId)
      const addedEffect = item?.effects?.at(-1)
      if (
        addedEffect?.effect.type === 'gpu-effect' &&
        addedEffect.effect.gpuEffectType === 'gpu-power-window'
      ) {
        useSpatialEffectEditorStore.getState().stopEditing()
        usePowerWindowEditorStore.getState().startEditing(itemId, addedEffect.id)
      }
    }
  }

  const { gpuCategories, triggerPreviews } = useGpuEffectPreviewData()
  // Which picker row is hovered — drives that thumbnail's live sweep animation.
  let hoveredPickerKey = $state<string | null>(null)

  // Update GPU effect parameter(s)
  const handleGpuParamChange = (
    effectId: string,
    paramKey: string,
    value: number | boolean | string,
  ) => {
    const effect = effects.find((e) => e.id === effectId)
    if (!effect || effect.effect.type !== 'gpu-effect') return

    const frame = currentFrame.current
    const keyframes = keyframesByItemId.current
    const displayKeyframeValue = getGpuEffectKeyframeValue(effect, paramKey, value)
    const autoOperations =
      displayKeyframeValue !== null
        ? visualItems.flatMap((item) => {
            const targetEffect = getMappedEffectEntry(item, effectId)
            if (!targetEffect || targetEffect.effect.type !== 'gpu-effect') {
              return []
            }

            const keyframeValue = getGpuEffectKeyframeValue(targetEffect, paramKey, value)
            const property = getGpuEffectKeyframeProperty(targetEffect, paramKey)
            if (keyframeValue === null || !property) {
              return []
            }

            const itemKeyframeState = keyframes.get(item.id) ?? undefined
            const operation = getAutoKeyframeOperation(
              item,
              itemKeyframeState ?? undefined,
              property,
              keyframeValue,
              frame,
            )
            return operation ? [operation] : []
          })
        : []

    if (autoOperations.length > 0) {
      applyAutoKeyframeOperations(autoOperations)
    }

    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect || targetEffect.effect.type !== 'gpu-effect') {
        return
      }

      const property = buildEffectAnimatableProperty(
        targetEffect.effect.gpuEffectType,
        targetEffect.id,
        paramKey,
      )
      const autoHandled =
        displayKeyframeValue !== null &&
        autoOperations.some(
          (operation) => operation.itemId === item.id && operation.property === property,
        )
      if (autoHandled) {
        return
      }

      updateEffect(item.id, targetEffect.id, {
        effect: {
          ...targetEffect.effect,
          params: { ...targetEffect.effect.params, [paramKey]: value },
        },
      })
    })
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  // Batch update multiple GPU effect params atomically
  const handleGpuParamsBatchChange = (
    effectId: string,
    updates: Record<string, number | boolean | string>,
  ) => {
    const effect = effects.find((e) => e.id === effectId)
    if (!effect || effect.effect.type !== 'gpu-effect') return

    const frame = currentFrame.current
    const keyframes = keyframesByItemId.current
    const autoOperations = visualItems.flatMap((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect || targetEffect.effect.type !== 'gpu-effect') {
        return []
      }

      const itemKeyframeState = keyframes.get(item.id) ?? undefined

      return Object.entries(updates).flatMap(([paramKey, paramValue]) => {
        const keyframeValue = getGpuEffectKeyframeValue(targetEffect, paramKey, paramValue)
        const property = getGpuEffectKeyframeProperty(targetEffect, paramKey)
        if (keyframeValue === null || !property) {
          return []
        }

        const operation = getAutoKeyframeOperation(
          item,
          itemKeyframeState ?? undefined,
          property,
          keyframeValue,
          frame,
        )
        return operation ? [operation] : []
      })
    })

    if (autoOperations.length > 0) {
      applyAutoKeyframeOperations(autoOperations)
    }

    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect || targetEffect.effect.type !== 'gpu-effect') {
        return
      }

      const fallbackUpdates = { ...updates }
      for (const [paramKey, paramValue] of Object.entries(updates)) {
        const property = buildEffectAnimatableProperty(
          targetEffect.effect.gpuEffectType,
          targetEffect.id,
          paramKey,
        )
        const autoHandled =
          getGpuEffectKeyframeValue(targetEffect, paramKey, paramValue) !== null &&
          autoOperations.some(
            (operation) => operation.itemId === item.id && operation.property === property,
          )
        if (autoHandled) {
          delete fallbackUpdates[paramKey]
        }
      }

      if (Object.keys(fallbackUpdates).length === 0) {
        return
      }

      updateEffect(item.id, targetEffect.id, {
        effect: {
          ...targetEffect.effect,
          params: { ...targetEffect.effect.params, ...fallbackUpdates },
        },
      })
    })
    queueMicrotask(() => useGizmoStore.getState().clearPreview())
  }

  // Live preview for GPU effect parameter
  const handleGpuParamLiveChange = (
    effectId: string,
    paramKey: string,
    value: number | boolean | string,
  ) => {
    const previews: Record<string, ItemEffect[]> = {}
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect) return
      previews[item.id] = (item.effects ?? []).map((entry) => {
        if (entry.id !== targetEffect.id || entry.effect.type !== 'gpu-effect') return entry
        const entryGpu = entry.effect as GpuEffect
        return {
          ...entry,
          effect: {
            ...entryGpu,
            params: { ...entryGpu.params, [paramKey]: value },
          },
        }
      })
    })
    useGizmoStore.getState().setEffectsPreviewNew(previews)
  }

  // Batch live preview for multiple GPU effect params atomically
  const handleGpuParamsBatchLiveChange = (
    effectId: string,
    updates: Record<string, number | boolean | string>,
  ) => {
    const previews: Record<string, ItemEffect[]> = {}
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect) return
      previews[item.id] = (item.effects ?? []).map((entry) => {
        if (entry.id !== targetEffect.id || entry.effect.type !== 'gpu-effect') return entry
        const entryGpu = entry.effect as GpuEffect
        return {
          ...entry,
          effect: {
            ...entryGpu,
            params: { ...entryGpu.params, ...updates },
          },
        }
      })
    })
    useGizmoStore.getState().setEffectsPreviewNew(previews)
  }

  // Reset GPU effect to defaults
  const handleResetGpuEffect = (effectId: string) => {
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect || targetEffect.effect.type !== 'gpu-effect') {
        return
      }

      const defaults = getGpuEffectDefaultParams(targetEffect.effect.gpuEffectType)
      updateEffect(item.id, targetEffect.id, {
        effect: { ...targetEffect.effect, params: defaults },
      })
    })
  }

  // Apply a preset (adds multiple GPU effects as single undo/redo action)
  const handleApplyPreset = (presetId: string) => {
    const preset = EFFECT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return

    // Batch all effects for all items into a single store update
    const updates = itemIds.map((id) => ({
      itemId: id,
      effects: preset.effects,
    }))
    addEffects(updates)
  }

  // Toggle effect visibility
  const handleToggle = (effectId: string) => {
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (targetEffect) {
        toggleEffect(item.id, targetEffect.id)
      }
    })
  }

  // Check if all effects are enabled
  const allEffectsEnabled = $derived(effects.length > 0 && effects.every((e) => e.enabled))

  // Toggle all effects on/off
  const handleToggleAll = () => {
    const newEnabled = !allEffectsEnabled
    visualItems.forEach((item) => {
      effects.forEach((effect) => {
        const targetEffect = getMappedEffectEntry(item, effect.id)
        // Only toggle if current state differs from target
        if (targetEffect && targetEffect.enabled !== newEnabled) {
          toggleEffect(item.id, targetEffect.id)
        }
      })
    })
  }

  // Move effect up/down within the stack (order matters for color math).
  // One undo step across all selected items.
  const handleMoveEffect = (effectId: string, direction: -1 | 1) => {
    const updates: Array<{ itemId: string; effects: ItemEffect[] }> = []
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (!targetEffect) return
      const itemEffects = item.effects ?? []
      const visibleItemEffects = itemEffects.filter((entry) => !isHiddenEffectEntry(entry))
      const visibleIndex = visibleItemEffects.findIndex((entry) => entry.id === targetEffect.id)
      const swapTarget = visibleItemEffects[visibleIndex + direction]
      if (visibleIndex < 0 || !swapTarget) return

      const index = itemEffects.findIndex((entry) => entry.id === targetEffect.id)
      const swapIndex = itemEffects.findIndex((entry) => entry.id === swapTarget.id)
      if (index < 0 || swapIndex < 0) return

      const reordered = [...itemEffects]
      const moved = reordered[index]!
      reordered[index] = reordered[swapIndex]!
      reordered[swapIndex] = moved
      updates.push({ itemId: item.id, effects: reordered })
    })
    if (updates.length > 0) {
      setItemEffects(updates)
    }
  }

  // Remove effect
  const handleRemove = (effectId: string) => {
    visualItems.forEach((item) => {
      const targetEffect = getMappedEffectEntry(item, effectId)
      if (targetEffect) {
        removeEffect(item.id, targetEffect.id)
      }
    })
  }

  // Effect picker popover state
  let pickerOpen = $state(false)
  let searchQuery = $state('')
  let trigger: HTMLButtonElement | null = $state(null)
  let panel: HTMLDivElement | null = $state(null)
  let searchInput: HTMLInputElement | null = $state(null)

  // Position the picker panel below the trigger button
  let panelStyle = $state('')

  const userPresets = select(useUserPresetsStore, (s) => s.presets)

  // Apply a user-saved preset (grade) to all selected items as one batch
  const handleApplyUserPreset = (presetId: string) => {
    const preset = useUserPresetsStore.getState().presets.find((p) => p.id === presetId)
    if (!preset) return
    addEffects(itemIds.map((id) => ({ itemId: id, effects: preset.effects })))
  }

  const openPicker = () => {
    triggerPreviews()
    void useUserPresetsStore.getState().loadPresets()
    searchQuery = ''
    // Measure the trigger synchronously so the portal mounts already
    // positioned — otherwise the first render flashes a full-width,
    // unconstrained panel before the positioning effect runs.
    if (trigger) {
      const rect = trigger.getBoundingClientRect()
      panelStyle = `position: fixed; top: ${rect.bottom + 4}px; left: ${rect.left}px; width: ${rect.width}px`
    }
    pickerOpen = true
  }

  const closePicker = () => {
    pickerOpen = false
    searchQuery = ''
    trigger?.blur()
  }

  // Focus the search input after the panel mounts.
  $effect(() => {
    if (!pickerOpen) return
    requestAnimationFrame(() => searchInput?.focus())
  })

  // Close on click outside. The composed path sees through the editor's
  // shadow root, where a document listener's `target` is the host.
  $effect(() => {
    if (!pickerOpen) return
    const handlePointerDown = (e: PointerEvent) => {
      const path = e.composedPath()
      if ((panel && path.includes(panel)) || (trigger && path.includes(trigger))) return
      closePicker()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  // Filter effects and presets by search query
  const filteredCategories = $derived.by(() => {
    const visibleCategories =
      hiddenGpuEffectTypeSet.size === 0
        ? gpuCategories
        : gpuCategories
            .map(({ category, effects: catEffects }) => ({
              category,
              effects: catEffects.filter((def) => !hiddenGpuEffectTypeSet.has(def.id)),
            }))
            .filter(({ effects: catEffects }) => catEffects.length > 0)

    if (!searchQuery.trim()) return visibleCategories
    const q = searchQuery.toLowerCase()
    return visibleCategories
      .map(({ category, effects: catEffects }) => ({
        category,
        effects: catEffects.filter((def) => getEffectDefinitionName(def).toLowerCase().includes(q)),
      }))
      .filter(({ effects: catEffects }) => catEffects.length > 0)
  })

  const filteredPresets = $derived.by(() => {
    const visiblePresets =
      hiddenGpuEffectTypeSet.size === 0
        ? EFFECT_PRESETS
        : EFFECT_PRESETS.filter((preset) => !hasHiddenGpuEffect(preset.effects))
    if (!searchQuery.trim()) return visiblePresets
    const q = searchQuery.toLowerCase()
    return visiblePresets.filter((p) => p.name.toLowerCase().includes(q))
  })

  const filteredUserPresets = $derived.by(() => {
    const visibleUserPresets =
      hiddenGpuEffectTypeSet.size === 0
        ? userPresets.current
        : userPresets.current.filter((preset) => !hasHiddenGpuEffect(preset.effects))
    if (!searchQuery.trim()) return visibleUserPresets
    const q = searchQuery.toLowerCase()
    return visibleUserPresets.filter((p) => p.name.toLowerCase().includes(q))
  })

  const hasResults = $derived(
    filteredCategories.length > 0 || filteredPresets.length > 0 || filteredUserPresets.length > 0,
  )

  const target = portalTarget()
  const pickerRowClass =
    'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground'
</script>

{#snippet addEffectControls()}
  <div class={isDock ? 'flex min-w-0 flex-1 gap-1' : 'px-2 pb-2 flex gap-1'}>
    <Button
      bind:ref={trigger}
      variant="outline"
      size="sm"
      class="flex-1 h-7 min-w-0 text-xs"
      onclick={() => (pickerOpen ? closePicker() : openPicker())}
    >
      <Plus class="w-3 h-3 mr-1" />
      <span class="truncate">{t('effects.section.addEffect')}</span>
    </Button>
    {#if pickerOpen}
      <Portal to={target}>
        <div
          bind:this={panel}
          style={panelStyle}
          class="z-50 rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
        >
          <!-- Search input -->
          <div class="p-1.5 border-b">
            <div class="relative">
              <Search
                class="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
              />
              <input
                bind:this={searchInput}
                type="text"
                bind:value={searchQuery}
                placeholder={t('effects.section.searchEffects')}
                class="w-full h-7 pl-7 pr-2 text-xs bg-transparent rounded-sm border border-input placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <!-- Scrollable effect list -->
          <div class="max-h-[420px] overflow-y-auto overflow-x-hidden p-1">
            <!-- GPU Shader Effects -->
            {#each filteredCategories as { category, effects: catEffects }, index (category)}
              <div>
                {#if index > 0}
                  <div class="-mx-1 my-1 h-px bg-muted"></div>
                {/if}
                <div class="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {getEffectCategoryLabel(effectT, category)}
                </div>
                {#each catEffects as def (def.id)}
                  <button
                    type="button"
                    class={pickerRowClass}
                    onmouseenter={() => (hoveredPickerKey = def.id)}
                    onmouseleave={() => {
                      if (hoveredPickerKey === def.id) hoveredPickerKey = null
                    }}
                    onclick={() => {
                      handleAddGpuEffect(def.id)
                      closePicker()
                    }}
                  >
                    <EffectThumbnail
                      effectId={def.id}
                      active={hoveredPickerKey === def.id}
                      class="w-8 h-[18px] rounded-sm flex-shrink-0"
                    />
                    {getEffectDefinitionName(def)}
                  </button>
                {/each}
              </div>
            {/each}

            {#if filteredPresets.length > 0}
              {#if filteredCategories.length > 0}
                <div class="-mx-1 my-1 h-px bg-muted"></div>
              {/if}
              <div class="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t('effects.section.presets')}
              </div>
              {#each filteredPresets as preset (preset.id)}
                <button
                  type="button"
                  class={pickerRowClass}
                  onmouseenter={() => (hoveredPickerKey = `preset:${preset.id}`)}
                  onmouseleave={() => {
                    if (hoveredPickerKey === `preset:${preset.id}`) hoveredPickerKey = null
                  }}
                  onclick={() => {
                    handleApplyPreset(preset.id)
                    closePicker()
                  }}
                >
                  <EffectThumbnail
                    effects={preset.effects}
                    active={hoveredPickerKey === `preset:${preset.id}`}
                    class="w-8 h-[18px] rounded-sm flex-shrink-0"
                  />
                  {preset.name}
                </button>
              {/each}
            {/if}

            {#if filteredUserPresets.length > 0}
              {#if filteredCategories.length > 0 || filteredPresets.length > 0}
                <div class="-mx-1 my-1 h-px bg-muted"></div>
              {/if}
              <div class="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t('effects.section.myPresets')}
              </div>
              {#each filteredUserPresets as preset (preset.id)}
                <div class="group relative flex items-center">
                  <button
                    type="button"
                    class="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 pr-7 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
                    onclick={() => {
                      handleApplyUserPreset(preset.id)
                      closePicker()
                    }}
                  >
                    <span class="w-8 h-[18px] rounded-sm bg-muted flex-shrink-0"></span>
                    <span class="truncate">{preset.name}</span>
                  </button>
                  <button
                    type="button"
                    class="absolute right-1.5 hidden h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive group-hover:flex"
                    onclick={(event) => {
                      event.stopPropagation()
                      void useUserPresetsStore.getState().removePreset(preset.id)
                    }}
                    title={t('effects.section.deletePreset')}
                  >
                    <X class="h-3 w-3" />
                  </button>
                </div>
              {/each}
            {/if}

            <!-- No results -->
            {#if !hasResults}
              <div class="px-2 py-4 text-xs text-muted-foreground text-center">
                {t('effects.section.noEffectsFound')}
              </div>
            {/if}
          </div>
        </div>
      </Portal>
    {/if}
    {#if effects.length > 0}
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2"
        onclick={handleToggleAll}
        title={allEffectsEnabled ? t('effects.section.disableAll') : t('effects.section.enableAll')}
      >
        {#if allEffectsEnabled}
          <EyeOff class="w-3.5 h-3.5" />
        {:else}
          <Eye class="w-3.5 h-3.5" />
        {/if}
      </Button>
    {/if}
  </div>
{/snippet}

{#snippet effectList()}
  <div class="space-y-0">
    {#each effects as effect, effectIndex (effect.id)}
      {#if effect.effect.type === 'gpu-effect'}
        {@const gpuEff = effect.effect as GpuEffect}
        {@const def = getGpuEffect(gpuEff.gpuEffectType)}
        {#if def}
          {@const displayGpuEffect = getResolvedDisplayGpuEffect(effect)}
          {@const canMoveUp = effectIndex > 0}
          {@const canMoveDown = effectIndex < effects.length - 1}
          {#if gpuEff.gpuEffectType === 'gpu-curves'}
            <GpuCurvesPanel
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              collapsible={gradePanelCollapsible}
              {onEditInColor}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onParamsBatchChange={handleGpuParamsBatchChange}
              onParamsBatchLiveChange={handleGpuParamsBatchLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else if gpuEff.gpuEffectType === 'gpu-lut'}
            <GpuLutPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onParamsBatchChange={handleGpuParamsBatchChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else if gpuEff.gpuEffectType === 'gpu-color-wheels'}
            <GpuWheelsPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              collapsible={gradePanelCollapsible}
              {onEditInColor}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onParamsBatchChange={handleGpuParamsBatchChange}
              onParamsBatchLiveChange={handleGpuParamsBatchLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else if gpuEff.gpuEffectType === 'gpu-gradient-map'}
            <GpuGradientMapPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else if gpuEff.gpuEffectType === 'gpu-secondary-qualifier'}
            <GpuSecondaryQualifierPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else if gpuEff.gpuEffectType === 'gpu-power-window'}
            <GpuPowerWindowPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {:else}
            <GpuEffectPanel
              {itemIds}
              {effect}
              gpuEffect={displayGpuEffect}
              definition={def}
              {getKeyframeProperty}
              onParamChange={handleGpuParamChange}
              onParamLiveChange={handleGpuParamLiveChange}
              onReset={handleResetGpuEffect}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onMove={handleMoveEffect}
              {canMoveUp}
              {canMoveDown}
            />
          {/if}
        {/if}
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet emptyState()}
  {#if effects.length === 0}
    <div class="px-2 py-3 text-xs text-muted-foreground text-center">
      {t('effects.section.emptyState')}
    </div>
  {/if}
{/snippet}

{#if visualItems.length > 0}
  {#if isDock}
    <section class="flex h-full min-h-0 flex-col overflow-hidden" data-testid="effects-section-dock">
      <div class="flex h-8 shrink-0 items-center gap-2 border-b border-border/70 px-2">
        <Sparkles class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 class="min-w-[4rem] truncate text-[11px] font-semibold text-muted-foreground">
          {t('effects.section.title')}
        </h3>
        {@render addEffectControls()}
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1">
        {@render effectList()}
        {@render emptyState()}
      </div>
    </section>
  {:else}
    <PropertySection title={t('effects.section.title')} icon={Sparkles} defaultOpen={true}>
      <!-- Add Effect Picker + Toggle All -->
      {@render addEffectControls()}

      <!-- Active Effects List - wrapped to prevent space-y-3 from PropertySection -->
      {@render effectList()}

      <!-- Empty state -->
      {@render emptyState()}
    </PropertySection>
  {/if}
{/if}
