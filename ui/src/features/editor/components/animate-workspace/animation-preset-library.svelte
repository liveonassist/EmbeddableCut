<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { MOTION_PRESETS } from '@/features/editor/deps/keyframes'
  import { EDIT_QUICK_PRESET_IDS } from './animation-preset-catalogue'

  const EDIT_QUICK_PRESETS = MOTION_PRESETS.filter((preset) => EDIT_QUICK_PRESET_IDS.has(preset.id))
</script>

<script lang="ts">
  import { MOTION_MODULATORS, MOTION_PRESET_CATEGORIES } from '@/features/editor/deps/keyframes'
  import type { TFunction } from 'i18next'
  import { toast } from 'svelte-sonner'
  import { select, shallow } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import type { CanvasSettings } from '@/types/transform'
  import type { AnimationKeyframeSource, AnimatableProperty } from '@/types/keyframe'
  import type { TextItem, TimelineItem } from '@/types/timeline'
  import type { TextMotionSlot } from '@/types/text-motion'
  import type { MotionModifierType } from '@/types/motion'
  import { cn } from '@/shared/ui/cn'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { TooltipProvider } from '@/components/ui/tooltip'
  import MotionBakeConfirmationDialog from '@/shared/ui/motion-bake-confirmation-dialog.svelte'
  import { useRafDeferredValue } from '@/shared/hooks/use-raf-deferred-value.svelte'
  import { useSelectionStore } from '@/shared/state/selection'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import {
    applyAnimationPreset,
    applyMotionLayersToItems,
    applyMotionPresetKeyframes,
    applyMotionModifierToItems,
    updateMotionModifiersLive,
    beginMotionModifierEdit,
    commitMotionModifierEdit,
    removeMotionModifierFromItems,
    removePresetKeyframeApplication,
    removeManualKeyframes,
    trimAnimationToItemBounds,
    removeTextMotionEffect,
    bakeMotionToKeyframes,
    captureAnimationFromItem,
    getPresetCompatibility,
    createMotionClip,
    openComposition,
    useItemsStore,
    useKeyframesStore,
    useTimelineCommandStore,
    useCompositionsStore,
    type MotionPresetClear,
    type MotionPresetVectorApply,
  } from '@/features/editor/deps/timeline-store'
  import { getSourceDimensions, resolveTransform } from '@/features/editor/deps/composition-runtime'
  import {
    getAnimatablePropertiesForItem,
    getMotionPresetAnchorFrame,
    motionPresetScalesBox,
    DEFAULT_MOTION_GENERATOR_SETTINGS,
    applyMotionGeneratorSettings,
    createMotionModifier,
    getMotionModifierSettings,
    updateMotionModifierSettings,
    createMotionAnimationLayer,
    buildBakeMotionPlan,
    countTrimmedKeyframes,
    resolveAnimatedTransform,
    type MotionPreset,
    type MotionPresetCategory,
    type MotionGeneratorSettings,
    type MotionModulator,
  } from '@/features/editor/deps/keyframes'
  import { getTextMotionTimelineBands } from '@/shared/timeline/text-motion-timeline'
  import {
    readAnimationPresets,
    saveAnimationPresets,
    type AnimationPreset,
  } from '@/infrastructure/storage'
  import SaveAnimationPresetDialog from './save-animation-preset-dialog.svelte'
  import { filterAnimationPresetCandidates } from './animation-preset-filter'
  import AppliedMotionSummary from './applied-motion-summary.svelte'
  import AnimationPresetLibraryEdit from './animation-preset-library-edit.svelte'
  import AnimationPresetToolbar from './animation-preset-toolbar.svelte'
  import ApplyModeSelector from './apply-mode-selector.svelte'
  import ContinuousMotionStage from './continuous-motion-stage.svelte'
  import {
    hasActiveMotionFilters,
    hasVisibleMotionResults,
    isMotionClipSelection,
  } from './motion-library-status'
  import { collectKeyframeApplications, summarizeManualKeyframes } from './motion-clip-summary'
  import MotionPresetStages from './motion-preset-stages.svelte'
  import SavedAnimationList from './saved-animation-list.svelte'
  import MotionPresetControls from './motion-preset-controls.svelte'
  import { MOTION_PRESET_PROPERTIES, presetsByCategory } from './animation-preset-catalogue'
  import { selectPresetSelectedItems } from './preset-selection'
  import type { ModifierEditSettings, MotionApplyMode } from './types'

  interface AnimationPresetLibraryProps {
    canvas: CanvasSettings
    /** Fill the shared Motion inspector rather than rendering a standalone sidebar. */
    embedded?: boolean
    /** Edit exposes a compact clip-level surface; Motion keeps the full authoring library. */
    variant?: 'full' | 'edit'
    /** Optional explicit targets, used to omit linked audio from clip-level animation. */
    itemIds?: string[]
  }

  /**
   * Animation preset library (U7, R16): browse and save/apply the project's saved
   * animation presets from the unified Motion workspace. Presentational shell over the
   * storage layer (U5) and apply path (U6); presets incompatible with the current
   * selection render disabled with a reason tooltip. (Per-keyframe easing curves
   * live in the dopesheet's interpolation icon row, not here.)
   */
  let { canvas, embedded = false, variant = 'full', itemIds }: AnimationPresetLibraryProps = $props()

  const projectId = select(useProjectStore, (s) => s.currentProject?.id ?? null)
  const storeSelectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const selectedItemIds = $derived(itemIds ?? storeSelectedItemIds.current)
  const itemsState = select(
    useItemsStore,
    (s) => ({ items: s.items, tracks: s.tracks, itemById: s.itemById }),
    shallow,
  )
  // Shallow-stable like React's useShallow: a fresh array with the same items
  // keeps the previous reference, so nothing downstream recomputes.
  let previousSelectedItems: TimelineItem[] = []
  const selectedItems = $derived.by(() => {
    const next = selectPresetSelectedItems(itemsState.current, selectedItemIds)
    if (shallow(previousSelectedItems, next)) return previousSelectedItems
    previousSelectedItems = next
    return next
  })
  const selectedItem = $derived(selectedItems[0] ?? null)
  // Motion-text stage targets the text items in the selection (the actions
  // skip non-text items anyway; this also gates the stage's visibility).
  const selectedTextItems = $derived(
    selectedItems.filter((item): item is TextItem => item.type === 'text'),
  )
  const keyframesByItemId = select(useKeyframesStore, (s) => s.keyframesByItemId)
  const selectedItemKeyframes = $derived(
    selectedItem ? (keyframesByItemId.current[selectedItem.id] ?? null) : null,
  )

  let presets = $state.raw<AnimationPreset[]>([])
  let dialogOpen = $state(false)
  let bakeDialogOpen = $state(false)
  // 'replace' (default) clears a preset's target properties before applying so
  // reapplying an entrance/exit preset swaps it; 'add' layers onto what's there.
  let applyMode = $state<MotionApplyMode>('replace')
  let searchQuery = $state('')
  let compatibleOnly = $state(false)
  // Keyframe-preset parameters are authoring inputs, not timeline state. Keep
  // the live slider state inside MotionPresetControls and hold the current
  // value in a plain variable so dragging does not re-render the preset grid.
  let motionGeneratorSettings: MotionGeneratorSettings = { ...DEFAULT_MOTION_GENERATOR_SETTINGS }
  const deferredSearch = useRafDeferredValue(() => searchQuery)
  const deferredSearchQuery = $derived(deferredSearch.current)

  $effect(() => {
    const id = projectId.current
    if (!id) {
      presets = []
      return
    }
    let cancelled = false
    void readAnimationPresets(id).then((loaded) => {
      if (!cancelled) presets = loaded
    })
    return () => {
      cancelled = true
    }
  })

  const canCapture = $derived(
    Boolean(
      selectedItem &&
      (selectedItemKeyframes?.properties.some((property) => property.keyframes.length > 0) ||
        selectedItemKeyframes?.vectorProperties?.some((property) => property.keyframes.length > 0) ||
        selectedItem.motionModifiers?.some((modifier) => modifier.enabled && modifier.amplitude > 0) ||
        selectedItem.motionLayers?.some((layer) => layer.enabled && layer.tracks.length > 0) ||
        (selectedItem.type === 'text' && selectedItem.textMotion)),
    ),
  )

  async function handleSave(name: string): Promise<boolean> {
    const id = projectId.current
    if (!id || !selectedItem) return false
    const captured = captureAnimationFromItem(selectedItem, selectedItemKeyframes ?? undefined)
    if (!captured) return false

    const withoutDuplicate = presets.filter(
      (preset) => preset.name.toLowerCase() !== name.toLowerCase(),
    )
    const next: AnimationPreset[] = [
      ...withoutDuplicate,
      { id: crypto.randomUUID(), name, createdAt: Date.now(), ...captured },
    ]
    try {
      await saveAnimationPresets(id, next)
      presets = next
      toast.success(t('editor.animatePresets.savedToast', { name }))
      return true
    } catch {
      return false
    }
  }

  function handleApply(preset: AnimationPreset) {
    if (!selectedItem) {
      toast.warning(t('editor.animatePresets.selectClipFirst'))
      return
    }
    if (applyMode === 'layer') {
      toast.warning(t('editor.animateStages.savedLayerUnsupported'))
      return
    }
    const result = applyAnimationPreset(selectedItem.id, preset, 0, {
      replace: applyMode === 'replace',
    })
    // Report failure only when nothing was committed. An effect can be added
    // even if every keyframe clamped out — that still mutated the clip.
    if (
      result.incompatible ||
      (result.applied === 0 && result.addedEffects === 0 && result.appliedProcedural === 0)
    ) {
      toast.warning(t('editor.animatePresets.applyFailed'))
      return
    }
    toast.success(t('editor.animatePresets.appliedToast', { name: preset.name }))
  }

  // Built-in motion presets resolve the clip's resting transform, build their
  // keyframes against it, then commit through the same undo-integrated path as
  // the text-animation presets.
  const motionPropertySets = $derived(
    new Map(
      selectedItems.map((item) => [
        item.id,
        new Set<AnimatableProperty>(getAnimatablePropertiesForItem(item)),
      ]),
    ),
  )

  // Disabled reason for a motion preset on the current selection, or null when
  // it can apply. Scale presets reflow text, so they are gated for text clips.
  function motionReason(preset: MotionPreset): string | null {
    if (selectedItems.length === 0) return t('editor.animatePresets.selectClipFirst')
    for (const item of selectedItems) {
      const motionPropertySet = motionPropertySets.get(item.id)
      if (item.type === 'text' && motionPresetScalesBox(preset)) {
        return t('editor.motionPresets.textIncompatible')
      }
      if (!motionPropertySet || !preset.properties.every((property) => motionPropertySet.has(property))) {
        return t('editor.animatePresets.incompatibleProperty')
      }
    }
    return null
  }

  function modulatorReason(modulator: MotionModulator): string | null {
    if (selectedItems.length === 0) return t('editor.animatePresets.selectClipFirst')
    for (const item of selectedItems) {
      const motionPropertySet = motionPropertySets.get(item.id)
      if (item.type === 'text' && modulator.scalesBox) {
        return t('editor.motionPresets.textIncompatible')
      }
      if (
        !motionPropertySet ||
        !modulator.properties.every((property) => motionPropertySet.has(property))
      ) {
        return t('editor.animatePresets.incompatibleProperty')
      }
    }
    return null
  }

  const filteredMotionPresetsByCategory = $derived(
    MOTION_PRESET_CATEGORIES.reduce(
      (map, category) => {
        map[category] = filterAnimationPresetCandidates(
          presetsByCategory[category].map((preset) => ({
            item: preset,
            label: t(`editor.motionPresets.items.${preset.labelKey}`),
            compatible: motionReason(preset) === null,
          })),
          deferredSearchQuery,
          compatibleOnly,
        )
        return map
      },
      {} as Record<MotionPresetCategory, MotionPreset[]>,
    ),
  )
  const filteredModulators = $derived(
    filterAnimationPresetCandidates(
      MOTION_MODULATORS.map((modulator) => ({
        item: modulator,
        label: t(`editor.motionGenerator.modulators.${modulator.labelKey}`),
        compatible: modulatorReason(modulator) === null,
      })),
      deferredSearchQuery,
      compatibleOnly,
    ),
  )

  function handleApplyMotion(preset: MotionPreset) {
    if (selectedItems.length === 0) {
      toast.warning(t('editor.animatePresets.selectClipFirst'))
      return
    }
    const keyframesById = keyframesByItemId.current
    const replace = applyMode === 'replace'
    const additiveLayer = applyMode === 'layer'
    const clearSet = new Set<AnimatableProperty>(MOTION_PRESET_PROPERTIES)
    const payloads: Array<
      { itemId: string; source?: AnimationKeyframeSource } & ReturnType<
        typeof applyMotionGeneratorSettings
      >[number]
    > = []
    const clears: MotionPresetClear[] = []
    const vectorApplies: MotionPresetVectorApply[] = []
    const layerAssignments: Parameters<typeof applyMotionLayersToItems>[0] = []

    selectedItems.forEach((item, index) => {
      const itemKeyframes = keyframesById[item.id]
      // In Replace mode the preset defines this clip's animation, so anchor the
      // resting pose off the BASE transform, ignoring existing keyframes on any
      // preset-owned property (they're about to be cleared in this region).
      const anchorKeyframes =
        replace && itemKeyframes
          ? {
              ...itemKeyframes,
              properties: itemKeyframes.properties.filter((entry) => !clearSet.has(entry.property)),
              vectorProperties: itemKeyframes.vectorProperties?.filter(
                (entry) => entry.property !== 'position' && entry.property !== 'scale',
              ),
            }
          : itemKeyframes
      const base = resolveTransform(item, canvas, getSourceDimensions(item))
      const anchorFrame = getMotionPresetAnchorFrame(preset.category, item.durationInFrames, canvas.fps)
      const anchor = resolveAnimatedTransform(base, anchorKeyframes, anchorFrame)
      const ctx = {
        anchor,
        durationInFrames: item.durationInFrames,
        fps: canvas.fps,
        frameWidth: canvas.width,
        frameHeight: canvas.height,
      }
      const built = applyMotionGeneratorSettings(
        preset,
        preset.build(ctx),
        ctx,
        motionGeneratorSettings,
        index,
      )
      if (built.length === 0) return
      if (additiveLayer) {
        const layer = createMotionAnimationLayer({
          name: t(`editor.motionPresets.items.${preset.labelKey}`),
          source: 'built-in-preset',
          sourcePresetId: preset.id,
          anchor,
          payloads: built,
        })
        layerAssignments.push({ itemId: item.id, layer })
        return
      }
      const source = {
        applicationId: crypto.randomUUID(),
        kind: 'built-in-preset' as const,
        presetId: preset.id,
        presetName: t(`editor.motionPresets.items.${preset.labelKey}`),
      }
      const existingVectorProperties = new Set(
        itemKeyframes?.vectorProperties
          ?.filter((property) => property.keyframes.length > 0)
          .map((property) => property.property) ?? [],
      )
      const vectorEvaluationKeyframes = replace ? anchorKeyframes : itemKeyframes
      const vectorControlledScalars = new Set<AnimatableProperty>()

      if (existingVectorProperties.has('position')) {
        const positionPayloads = built.filter(
          (keyframe) => keyframe.property === 'x' || keyframe.property === 'y',
        )
        if (positionPayloads.length > 0) {
          const frames = [...new Set(positionPayloads.map((keyframe) => keyframe.frame))]
          const fromFrame = Math.min(...frames)
          const toFrame = Math.max(...frames)
          vectorApplies.push({
            itemId: item.id,
            property: 'position',
            keyframes: frames.map((frame) => {
              const pose = resolveAnimatedTransform(base, vectorEvaluationKeyframes, frame)
              const x = positionPayloads.find(
                (keyframe) => keyframe.frame === frame && keyframe.property === 'x',
              )
              const y = positionPayloads.find(
                (keyframe) => keyframe.frame === frame && keyframe.property === 'y',
              )
              const style = x ?? y!
              return {
                frame,
                value: { x: x?.value ?? pose.x, y: y?.value ?? pose.y },
                easing: style.easing,
                easingConfig: style.easingConfig,
                source,
              }
            }),
            ...(replace && { replaceRange: { fromFrame, toFrame } }),
          })
          vectorControlledScalars.add('x')
          vectorControlledScalars.add('y')
        }
      }

      if (existingVectorProperties.has('scale')) {
        const scalePayloads = built.filter(
          (keyframe) => keyframe.property === 'width' || keyframe.property === 'height',
        )
        if (scalePayloads.length > 0) {
          const frames = [...new Set(scalePayloads.map((keyframe) => keyframe.frame))]
          const fromFrame = Math.min(...frames)
          const toFrame = Math.max(...frames)
          vectorApplies.push({
            itemId: item.id,
            property: 'scale',
            keyframes: frames.map((frame) => {
              const pose = resolveAnimatedTransform(base, vectorEvaluationKeyframes, frame)
              const width = scalePayloads.find(
                (keyframe) => keyframe.frame === frame && keyframe.property === 'width',
              )
              const height = scalePayloads.find(
                (keyframe) => keyframe.frame === frame && keyframe.property === 'height',
              )
              const style = width ?? height!
              const resolvedWidth = width?.value ?? pose.width
              const resolvedHeight = height?.value ?? pose.height
              return {
                frame,
                value: {
                  x: base.width === 0 ? 100 : (resolvedWidth / base.width) * 100,
                  y: base.height === 0 ? 100 : (resolvedHeight / base.height) * 100,
                },
                easing: style.easing,
                easingConfig: style.easingConfig,
                source,
              }
            }),
            ...(replace && { replaceRange: { fromFrame, toFrame } }),
          })
          vectorControlledScalars.add('width')
          vectorControlledScalars.add('height')
        }
      }

      for (const keyframe of built) {
        if (!vectorControlledScalars.has(keyframe.property)) {
          payloads.push({ itemId: item.id, ...keyframe, source })
        }
      }

      if (replace) {
        // Clear every preset-owned property within THIS preset's frame window,
        // so a new entrance wipes a previous entrance (whatever properties it
        // used) while an exit at the other end of the clip is left intact.
        const frames = built.map((keyframe) => keyframe.frame)
        const fromFrame = Math.min(...frames)
        const toFrame = Math.max(...frames)
        for (const property of MOTION_PRESET_PROPERTIES) {
          clears.push({ itemId: item.id, property, fromFrame, toFrame })
        }
      }
    })

    if (additiveLayer) {
      const applied = applyMotionLayersToItems(layerAssignments)
      if (applied === 0) {
        toast.warning(t('editor.animatePresets.applyFailed'))
        return
      }
      toast.success(
        t('editor.animatePresets.appliedToast', {
          name: t(`editor.motionPresets.items.${preset.labelKey}`),
        }),
      )
      return
    }
    if (payloads.length === 0 && vectorApplies.length === 0) {
      toast.warning(t('editor.animatePresets.applyFailed'))
      return
    }
    // The action drops keyframes that land inside a transition region; if every
    // keyframe was dropped nothing was applied, so don't claim success.
    const mergePayloads = replace
      ? payloads
      : payloads.filter((payload) => {
          const itemKeyframes = keyframesById[payload.itemId]
          const lane = itemKeyframes?.properties.find(
            (candidate) => candidate.property === payload.property,
          )
          return !lane?.keyframes.some((keyframe) => keyframe.frame === payload.frame)
        })
    const appliedIds = applyMotionPresetKeyframes(mergePayloads, replace ? clears : [], vectorApplies)
    if (appliedIds.length === 0) {
      toast.warning(t('editor.animatePresets.transitionBlocked'))
      return
    }
    toast.success(
      t('editor.animatePresets.appliedToast', {
        name: t(`editor.motionPresets.items.${preset.labelKey}`),
      }),
    )
  }

  // A modulator is "active" when every selected clip already carries it — used
  // to drive the toggle-off behavior and the button's pressed state.
  const activeModulatorIds = $derived.by(() => {
    const active = new Set<string>()
    if (selectedItems.length === 0) return active
    for (const modulator of MOTION_MODULATORS) {
      const onEvery = selectedItems.every((item) =>
        item.motionModifiers?.some((entry) => entry.type === modulator.id && entry.enabled),
      )
      if (onEvery) active.add(modulator.id)
    }
    return active
  })

  // Apply-on-click: attach a parametric modifier with sensible defaults. It runs
  // live at render time (non-destructive); the per-row flyout tunes it afterward.
  // Per-item index staggers phase/seed across a multi-clip selection.
  function handleApplyModulator(modulator: MotionModulator) {
    const reason = modulatorReason(modulator)
    if (reason) {
      toast.warning(reason)
      return
    }
    const assignments = selectedItems.map((item, index) => ({
      itemId: item.id,
      modifier: createMotionModifier(modulator.id, DEFAULT_MOTION_GENERATOR_SETTINGS, index),
    }))
    const applied = applyMotionModifierToItems(assignments)
    if (applied === 0) {
      toast.warning(t('editor.motionGenerator.modulatorApplyFailed'))
      return
    }
    toast.success(
      t('editor.motionGenerator.modulatorApplied', {
        name: t(`editor.motionGenerator.modulators.${modulator.labelKey}`),
        count: applied,
      }),
    )
  }

  function handleRemoveModulator(modulator: MotionModulator) {
    if (selectedItems.length === 0) return
    removeMotionModifierFromItems(
      selectedItems.map((item) => item.id),
      modulator.id,
    )
    toast.success(
      t('editor.motionGenerator.modulatorRemoved', {
        name: t(`editor.motionGenerator.modulators.${modulator.labelKey}`),
      }),
    )
  }

  // Live settings of each applied modulator on the first selected clip — seeds
  // the flyout sliders so they open showing the modifier's current values.
  const modulatorSettingsByType = $derived.by(() => {
    const map = new Map<MotionModifierType, ReturnType<typeof getMotionModifierSettings>>()
    for (const modifier of selectedItem?.motionModifiers ?? []) {
      if (modifier.enabled) map.set(modifier.type, getMotionModifierSettings(modifier))
    }
    return map
  })

  // One coalesced undo per flyout drag: snapshot on the first live change, commit
  // on release. A plain click (no drag) commits directly. Only one flyout opens
  // at a time, so a single variable tracks the active gesture.
  let modifierEdit: ReturnType<typeof beginMotionModifierEdit> | null = null
  function buildModifierEditAssignments(type: MotionModifierType, settings: ModifierEditSettings) {
    return selectedItems.flatMap((item) => {
      const existing = item.motionModifiers?.find((m) => m.type === type && m.enabled)
      return existing
        ? [{ itemId: item.id, modifier: updateMotionModifierSettings(existing, settings) }]
        : []
    })
  }
  function handleModulatorLiveEdit(type: MotionModifierType, settings: ModifierEditSettings) {
    const assignments = buildModifierEditAssignments(type, settings)
    if (assignments.length === 0) return
    if (!modifierEdit) modifierEdit = beginMotionModifierEdit()
    updateMotionModifiersLive(assignments)
  }
  function handleModulatorCommitEdit(type: MotionModifierType, settings: ModifierEditSettings) {
    const assignments = buildModifierEditAssignments(type, settings)
    if (assignments.length === 0) return
    if (modifierEdit) {
      updateMotionModifiersLive(assignments)
      commitMotionModifierEdit(modifierEdit, {
        type,
        itemIds: assignments.map((assignment) => assignment.itemId),
      })
      modifierEdit = null
    } else {
      applyMotionModifierToItems(assignments)
    }
  }

  // Bake bridge: any selected clip carrying procedural motion can be flattened
  // to editable keyframes (drift/breath/shake transforms + audio-pulse effects).
  const hasBakeableMotion = $derived(
    selectedItems.some(
      (item) =>
        item.motionModifiers?.some((modifier) => modifier.enabled) ||
        item.motionLayers?.some((layer) => layer.enabled) ||
        item.effects?.some((effect) => effect.audioPulse?.enabled),
    ),
  )

  function handleBakeMotion() {
    const plan = buildBakeMotionPlan({
      items: selectedItems,
      keyframesByItemId: keyframesByItemId.current,
      fps: canvas.fps,
      frameWidth: canvas.width,
      frameHeight: canvas.height,
      resolveBase: (item) => resolveTransform(item, canvas, getSourceDimensions(item)),
    })

    if (plan.length === 0) {
      toast.warning(t('editor.motionGenerator.bakeNoMotion'))
      return
    }

    const baked = bakeMotionToKeyframes(plan)
    bakeDialogOpen = false
    toast.success(t('editor.motionGenerator.motionBaked', { count: baked }))
  }

  async function handleDelete(preset: AnimationPreset) {
    const id = projectId.current
    if (!id) return
    const next = presets.filter((candidate) => candidate.id !== preset.id)
    try {
      await saveAnimationPresets(id, next)
      presets = next
    } catch {
      toast.warning(t('editor.animatePresets.saveFailed'))
    }
  }

  // Compatibility depends only on the presets and the target item, so compute
  // it once per change rather than per preset on every render.
  const compatibilityByPresetId = $derived.by(() => {
    const map = new Map<string, ReturnType<typeof getPresetCompatibility>>()
    if (!selectedItem) return map
    for (const preset of presets) {
      map.set(preset.id, getPresetCompatibility(preset, selectedItem))
    }
    return map
  })

  function incompatibilityReason(preset: AnimationPreset): string | null {
    if (!selectedItem) return t('editor.animatePresets.selectClipFirst')
    if (applyMode === 'layer') return t('editor.animateStages.savedLayerUnsupported')
    const compatibility = compatibilityByPresetId.get(preset.id)
    if (!compatibility || compatibility.compatible) return null
    return compatibility.reason === 'type-mismatch'
      ? t('editor.animatePresets.incompatibleType', { type: preset.sourceItemType })
      : t('editor.animatePresets.incompatibleProperty')
  }
  const filteredSavedPresets = $derived(
    filterAnimationPresetCandidates(
      presets.map((preset) => ({
        item: preset,
        label: preset.name,
        compatible: incompatibilityReason(preset) === null,
      })),
      deferredSearchQuery,
      compatibleOnly,
    ),
  )
  const visibleMotionPresetCount = $derived(
    MOTION_PRESET_CATEGORIES.reduce(
      (count, category) => count + filteredMotionPresetsByCategory[category].length,
      0,
    ),
  )
  const filtersActive = $derived(hasActiveMotionFilters(deferredSearchQuery, compatibleOnly))
  const hasVisiblePresetResults = $derived(
    hasVisibleMotionResults(
      visibleMotionPresetCount,
      filteredModulators.length,
      filteredSavedPresets.length,
      selectedTextItems.length,
    ),
  )

  // --- "Applied to this clip" summary (state the panel otherwise hides) ---
  // The summary builders take i18next's TFunction; `t` is its reactive wrapper.
  const translate = t as unknown as TFunction
  const keyframeApplications = $derived(collectKeyframeApplications(selectedItemKeyframes, translate))
  const manualKeyframeSummary = $derived(summarizeManualKeyframes(selectedItemKeyframes, translate))
  const trimmedKeyframeCount = $derived(
    selectedItem ? countTrimmedKeyframes(selectedItemKeyframes, selectedItem.durationInFrames) : 0,
  )
  const activeModulators = $derived(
    MOTION_MODULATORS.filter((modulator) => activeModulatorIds.has(modulator.id)),
  )
  const activeMotionLayers = $derived(selectedItem?.motionLayers?.filter((layer) => layer.enabled) ?? [])
  const hasAudioPulse = $derived(!!selectedItem?.effects?.some((effect) => effect.audioPulse?.enabled))
  const activeTextMotion = $derived.by(() => {
    const item = selectedItem
    if (!item || item.type !== 'text' || !item.textMotion) return []
    return (['in', 'out', 'loop'] as const).flatMap((slot) => {
      const effect = item.textMotion?.[slot]
      return effect ? [{ slot, effect }] : []
    })
  })
  const hasAnyAnimation = $derived(
    manualKeyframeSummary.keyframeCount > 0 ||
      keyframeApplications.length > 0 ||
      activeMotionLayers.length > 0 ||
      activeModulators.length > 0 ||
      activeTextMotion.length > 0 ||
      hasAudioPulse,
  )

  function navigateToAbsoluteFrame(frame: number) {
    const playback = usePlaybackStore.getState()
    playback.pause()
    playback.finishScrub(Math.max(0, Math.round(frame)))
  }
  function navigateToItemFrame(frame: number) {
    if (!selectedItem) return
    const localFrame = Math.min(
      Math.max(0, Math.round(frame)),
      Math.max(0, selectedItem.durationInFrames - 1),
    )
    navigateToAbsoluteFrame(selectedItem.from + localFrame)
  }
  function navigateToTextMotion(slot: TextMotionSlot) {
    if (!selectedItem) return
    const band = getTextMotionTimelineBands(selectedItem).find((candidate) => candidate.slot === slot)
    if (band) navigateToAbsoluteFrame(band.fromFrame)
  }

  function handleRemoveManualKeyframes() {
    if (!selectedItem) return
    removeManualKeyframes(selectedItem.id)
  }

  function handleTrimAnimation() {
    if (!selectedItem) return
    const itemId = selectedItem.id
    const removedCount = trimAnimationToItemBounds(itemId)
    if (removedCount === 0) return
    toast.success(
      t('timeline.keyframeEditor.trimAnimationToast', {
        count: removedCount,
      }),
      {
        action: {
          label: t('timeline.header.undo'),
          onClick: () => {
            const commandStore = useTimelineCommandStore.getState()
            const latest = commandStore.undoStack.at(-1)
            if (
              latest?.command.type === 'TRIM_ANIMATION_TO_BOUNDS' &&
              latest.command.payload?.itemId === itemId
            ) {
              commandStore.undo()
            }
          },
        },
      },
    )
  }

  function handleRemovePresetApplication(applicationId: string) {
    if (!selectedItem) return
    removePresetKeyframeApplication(selectedItem.id, applicationId)
  }

  function handleRemoveTextMotion(slot: TextMotionSlot) {
    removeTextMotionEffect(selectedItemIds, slot)
  }

  function handleMotionGeneratorSettingsChange(settings: MotionGeneratorSettings) {
    motionGeneratorSettings = settings
  }

  const compositionById = select(useCompositionsStore, (state) => state.compositionById)
  const selectedCompositionKind = $derived(
    selectedItem?.type === 'composition'
      ? compositionById.current[selectedItem.compositionId]?.editorKind
      : undefined,
  )
  const isMotionClip = $derived(
    isMotionClipSelection(selectedItems.length, selectedItem?.type, selectedCompositionKind),
  )
  function handleMotionClip() {
    if (isMotionClip && selectedItem?.type === 'composition') {
      openComposition(selectedItem.compositionId, selectedItem.label, selectedItem.id)
      return
    }
    if (selectedItems.length === 0) return
    const baseName = selectedItem?.label?.trim() || t('editor.editAnimation.untitledClip')
    createMotionClip(
      `${baseName} Motion`,
      selectedItems.map((item) => item.id),
    )
  }
</script>

{#if variant === 'edit'}
  <AnimationPresetLibraryEdit
    quickPresets={EDIT_QUICK_PRESETS}
    reasonFor={motionReason}
    onApplyPreset={handleApplyMotion}
    {hasAnyAnimation}
    {manualKeyframeSummary}
    {trimmedKeyframeCount}
    {keyframeApplications}
    {activeTextMotion}
    {selectedItems}
    {selectedTextItems}
    {canvas}
    onRemoveManualKeyframes={handleRemoveManualKeyframes}
    onTrimAnimation={handleTrimAnimation}
    onRemovePresetApplication={handleRemovePresetApplication}
    onNavigateToItemFrame={navigateToItemFrame}
    onRemoveTextMotion={handleRemoveTextMotion}
    onNavigateToTextMotion={navigateToTextMotion}
    {isMotionClip}
    onMotionClip={handleMotionClip}
    {t}
  />
{:else}
  <TooltipProvider delayDuration={300}>
    <div
      class={cn('flex h-full min-w-0 flex-col bg-background', embedded ? 'w-full' : 'w-72 border-l border-border')}
      data-testid="motion-library"
    >
      <AnimationPresetToolbar
        {canCapture}
        {searchQuery}
        onSearchQueryChange={(value) => (searchQuery = value)}
        {compatibleOnly}
        onToggleCompatibleOnly={() => (compatibleOnly = !compatibleOnly)}
        onOpenSaveDialog={() => (dialogOpen = true)}
        {t}
      />

      <ScrollArea class="min-h-0 flex-1">
        <!-- Extra right padding clears the overlay scrollbar so values aren't clipped. -->
        <div class="flex flex-col gap-4 p-3 pr-4">
          <!-- ── Applied state for the selected clip — keyframes, live
              modulators, audio pulse. Each removable thing carries an ✕. ── -->
          {#if hasAnyAnimation}
            <AppliedMotionSummary
              variant="panel"
              {manualKeyframeSummary}
              {trimmedKeyframeCount}
              {keyframeApplications}
              {activeTextMotion}
              {selectedItems}
              {canvas}
              onRemoveManualKeyframes={handleRemoveManualKeyframes}
              onTrimAnimation={handleTrimAnimation}
              onRemovePresetApplication={handleRemovePresetApplication}
              onNavigateToItemFrame={navigateToItemFrame}
              onRemoveTextMotion={handleRemoveTextMotion}
              onNavigateToTextMotion={navigateToTextMotion}
              {t}
            />
          {/if}

          <!-- ── Start: presets (declarative). Picking one fills the dopesheet
              with editable keyframes — the cue points users at the graph. ── -->
          <p class="rounded-md bg-secondary/30 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            {t('editor.animateStages.presetsHint')}
          </p>

          <!-- Keyframe presets can replace a region, merge diamonds into the
              base lanes, or remain independent as a named additive layer. -->
          <ApplyModeSelector mode={applyMode} onChange={(mode) => (applyMode = mode)} {t} />

          <MotionPresetControls onSettingsChange={handleMotionGeneratorSettingsChange} {t} />

          <MotionPresetStages
            presetsByCategory={filteredMotionPresetsByCategory}
            {selectedTextItems}
            query={deferredSearchQuery}
            reasonFor={motionReason}
            onApply={handleApplyMotion}
            {t}
          />

          <!-- Layer behaviours and text loops share the same user intent even
              though only the layer behaviours can be baked to keyframes. -->
          <ContinuousMotionStage
            modulators={filteredModulators}
            {activeModulatorIds}
            settingsByModulator={modulatorSettingsByType}
            {selectedTextItems}
            query={deferredSearchQuery}
            reasonFor={modulatorReason}
            onApplyModulator={handleApplyModulator}
            onRemoveModulator={handleRemoveModulator}
            onLiveEdit={handleModulatorLiveEdit}
            onCommitEdit={handleModulatorCommitEdit}
            {hasBakeableMotion}
            onOpenBakeDialog={() => (bakeDialogOpen = true)}
            {t}
          />

          <SavedAnimationList
            {presets}
            visiblePresets={filteredSavedPresets}
            {filtersActive}
            hasVisibleResults={hasVisiblePresetResults}
            reasonFor={incompatibilityReason}
            onApply={handleApply}
            onDelete={handleDelete}
            {t}
          />
        </div>
      </ScrollArea>

      <SaveAnimationPresetDialog
        open={dialogOpen}
        onOpenChange={(open) => (dialogOpen = open)}
        existingNames={presets.map((preset) => preset.name)}
        onSave={handleSave}
      />
      <MotionBakeConfirmationDialog
        open={bakeDialogOpen}
        onOpenChange={(open) => (bakeDialogOpen = open)}
        onConfirm={handleBakeMotion}
      />
    </div>
  </TooltipProvider>
{/if}
