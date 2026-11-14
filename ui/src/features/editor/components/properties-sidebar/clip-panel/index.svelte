<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { useItemsStore } from '@/features/editor/deps/timeline-store'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import type { TimelineItem } from '@/types/timeline'
  import { getLinkedAudioCompanion } from '@/shared/utils/linked-media'

  /** One shared import per lazily loaded section, so a re-render reuses the resolved module. */
  function lazy<T>(load: () => Promise<T>): () => Promise<T> {
    let promise: Promise<T> | null = null
    return () => (promise ??= load())
  }

  const loadAudioSection = lazy(() => import('./audio-section.svelte'))
  const loadSubtitleSection = lazy(() => import('./subtitle-section'))
  const loadTextSection = lazy(() => import('./text-section'))
  const loadAnimationPresetLibrary = lazy(
    () => import('../../animate-workspace/animation-preset-library.svelte'),
  )

  /**
   * Check if an item is a GIF (image with .gif extension)
   */
  function isGifItem(item: TimelineItem): boolean {
    return item.type === 'image' && (item.label?.toLowerCase().endsWith('.gif') ?? false)
  }

  /**
   * Compute item type information in a single pass for efficiency.
   * Uses Set for O(1) type lookups instead of repeated array iterations.
   */
  function computeItemTypeInfo(items: TimelineItem[]) {
    const types = new Set(items.map((item) => item.type))
    const hasGifItems = items.some(isGifItem)

    return {
      hasVisualItems:
        types.has('video') ||
        types.has('image') ||
        types.has('text') ||
        types.has('shape') ||
        types.has('adjustment') ||
        types.has('composition') ||
        types.has('subtitle') ||
        types.has('lottie') ||
        types.has('controller'),
      hasVideoItems: types.has('video'),
      hasCompositionItems: types.has('composition'),
      hasLottieItems: types.has('lottie'),
      hasGifItems,
      hasAudioItems: types.has('video') || types.has('audio'),
      hasTextItems: types.has('text'),
      hasShapeItems: types.has('shape'),
      hasAdjustmentItems: types.has('adjustment'),
      hasSubtitleItems: types.has('subtitle'),
      hasVirtualSubtitleItems: items.some(
        (item) =>
          (item.type === 'video' || item.type === 'audio') &&
          item.isReversed !== true &&
          item.transcriptCaptions?.type === 'transcript' &&
          item.transcriptCaptions.cues.length > 0,
      ),
      isOnlyTextOrShape:
        items.length > 0 && items.every((item) => item.type === 'text' || item.type === 'shape'),
      // Pure text selection gets a text-specific tab layout: Text / Animation /
      // Effects instead of Video / Audio / Effects.
      isOnlyText: items.length > 0 && items.every((item) => item.type === 'text'),
      // Pure shape selection gets a Shape tab (no audio) instead of Video.
      isOnlyShape: items.length > 0 && items.every((item) => item.type === 'shape'),
      isOnlyController: items.length > 0 && items.every((item) => item.type === 'controller'),
    }
  }

  interface ClipPanelSnapshot {
    selectedItems: TimelineItem[]
    audioPanelItems: TimelineItem[]
  }

  type ItemsStoreState = ReturnType<typeof useItemsStore.getState>
  type GizmoStoreState = ReturnType<typeof useGizmoStore.getState>

  function readClipPanelSnapshot(
    state: ItemsStoreState,
    selectedItemIds: readonly string[],
  ): ClipPanelSnapshot {
    const selectedItems = selectedItemIds.flatMap((itemId) => {
      const item = state.itemById[itemId]
      return item ? [item] : []
    })
    const audioPanelItems = selectedItemIds.flatMap((itemId) => {
      const item = state.itemById[itemId]
      if (!item || (item.type !== 'video' && item.type !== 'audio')) return []
      if (item.type === 'audio') return [item]
      return [getLinkedAudioCompanion(state.items, item) ?? item]
    })
    return { selectedItems, audioPanelItems }
  }

  function areItemListsReferentiallyEqual(
    previous: readonly TimelineItem[],
    next: readonly TimelineItem[],
  ): boolean {
    return previous.length === next.length && previous.every((item, index) => item === next[index])
  }

  function areRecordsEqualExceptKeys(
    previous: Readonly<Record<string, unknown>>,
    next: Readonly<Record<string, unknown>>,
    ignoredKeys: ReadonlySet<string>,
  ): boolean {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
    for (const key of keys) {
      if (!ignoredKeys.has(key) && previous[key] !== next[key]) return false
    }
    return true
  }

  const ITEM_TRANSFORM_KEY = new Set(['transform'])
  const POSITION_TRANSFORM_KEYS = new Set(['x', 'y'])

  function isTranslateOnlyItemChange(previous: TimelineItem, next: TimelineItem): boolean {
    if (previous.id !== next.id) return false
    if (previous === next) return true
    if (
      !areRecordsEqualExceptKeys(
        previous as unknown as Readonly<Record<string, unknown>>,
        next as unknown as Readonly<Record<string, unknown>>,
        ITEM_TRANSFORM_KEY,
      )
    ) {
      return false
    }

    return areRecordsEqualExceptKeys(
      (previous.transform ?? {}) as Readonly<Record<string, unknown>>,
      (next.transform ?? {}) as Readonly<Record<string, unknown>>,
      POSITION_TRANSFORM_KEYS,
    )
  }

  function isTranslateOnlyItemListChange(
    previous: readonly TimelineItem[],
    next: readonly TimelineItem[],
    activeItemId: string,
  ): { valid: boolean; changed: boolean } {
    if (previous.length !== next.length) return { valid: false, changed: false }

    let changed = false
    for (const [index, previousItem] of previous.entries()) {
      const nextItem = next[index]
      if (!nextItem || previousItem.id !== nextItem.id) {
        return { valid: false, changed: false }
      }
      if (previousItem === nextItem) continue
      if (previousItem.id !== activeItemId || !isTranslateOnlyItemChange(previousItem, nextItem)) {
        return { valid: false, changed: false }
      }
      changed = true
    }

    return { valid: true, changed }
  }

  function isTranslateOnlySnapshotChange(
    previous: ClipPanelSnapshot,
    next: ClipPanelSnapshot,
    activeItemId: string,
  ): boolean {
    const selectedChange = isTranslateOnlyItemListChange(
      previous.selectedItems,
      next.selectedItems,
      activeItemId,
    )
    if (!selectedChange.valid) return false

    const audioChange = isTranslateOnlyItemListChange(
      previous.audioPanelItems,
      next.audioPanelItems,
      activeItemId,
    )
    return audioChange.valid && (selectedChange.changed || audioChange.changed)
  }

  function areSnapshotsReferentiallyEqual(
    previous: ClipPanelSnapshot,
    next: ClipPanelSnapshot,
  ): boolean {
    return (
      areItemListsReferentiallyEqual(previous.selectedItems, next.selectedItems) &&
      areItemListsReferentiallyEqual(previous.audioPanelItems, next.audioPanelItems)
    )
  }

  function scheduleInspectorCatchUp(callback: () => void): () => void {
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(callback, { timeout: 120 })
      return () => window.cancelIdleCallback(idleId)
    }

    const animationFrameId = window.requestAnimationFrame(callback)
    return () => window.cancelAnimationFrame(animationFrameId)
  }

  function createClipPanelSnapshotBridge(selectedIds: readonly string[]): {
    subscribe: (listener: () => void) => () => void
    getSnapshot: () => ClipPanelSnapshot
  } {
    const selectedItemIds = [...selectedIds]
    let observedSnapshot = readClipPanelSnapshot(useItemsStore.getState(), selectedItemIds)
    let renderedSnapshot = observedSnapshot
    let lastRetainedTranslateInteractionId: number | null = null
    let lastObservedHandoffInteractionId: number | null = null
    let cancelScheduledCatchUp: (() => void) | null = null
    let unsubscribeItems: (() => void) | null = null
    let unsubscribeGizmo: (() => void) | null = null
    const listeners = new Set<() => void>()

    const emit = () => {
      for (const listener of listeners) listener()
    }
    const publishCanonicalSnapshot = () => {
      cancelScheduledCatchUp = null
      if (useGizmoStore.getState().activeGizmo) return

      const nextSnapshot = readClipPanelSnapshot(useItemsStore.getState(), selectedItemIds)
      observedSnapshot = nextSnapshot
      if (areSnapshotsReferentiallyEqual(renderedSnapshot, nextSnapshot)) return
      renderedSnapshot = nextSnapshot
      emit()
    }
    const handleItemsChange = (state: ItemsStoreState) => {
      const nextObserved = readClipPanelSnapshot(state, selectedItemIds)
      if (areSnapshotsReferentiallyEqual(observedSnapshot, nextObserved)) return

      const gizmoState = useGizmoStore.getState()
      const translateInteraction =
        gizmoState.activeGizmo?.mode === 'translate'
          ? gizmoState.activeGizmo
          : gizmoState.presentationHandoff?.mode === 'translate'
            ? gizmoState.presentationHandoff
            : null
      const shouldRetain =
        translateInteraction !== null &&
        translateInteraction.interactionId !== lastRetainedTranslateInteractionId &&
        isTranslateOnlySnapshotChange(observedSnapshot, nextObserved, translateInteraction.itemId)

      observedSnapshot = nextObserved
      if (shouldRetain) {
        lastRetainedTranslateInteractionId = translateInteraction.interactionId
        return
      }
      if (areSnapshotsReferentiallyEqual(renderedSnapshot, nextObserved)) return
      renderedSnapshot = nextObserved
      emit()
    }
    const handleGizmoChange = (state: GizmoStoreState) => {
      if (state.activeGizmo) {
        cancelScheduledCatchUp?.()
        cancelScheduledCatchUp = null
      }

      const handoffInteractionId =
        state.presentationHandoff?.mode === 'translate'
          ? state.presentationHandoff.interactionId
          : null
      if (handoffInteractionId === lastObservedHandoffInteractionId) return
      lastObservedHandoffInteractionId = handoffInteractionId
      // Canonical visual acknowledgement clears the handoff quickly. Keep the
      // already scheduled inspector catch-up alive; only a new interaction
      // should cancel it.
      if (handoffInteractionId === null) return

      cancelScheduledCatchUp?.()
      cancelScheduledCatchUp = null

      if (handoffInteractionId === lastRetainedTranslateInteractionId) {
        cancelScheduledCatchUp = scheduleInspectorCatchUp(publishCanonicalSnapshot)
      }
    }

    return {
      getSnapshot: () => renderedSnapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        if (listeners.size === 1) {
          unsubscribeItems = useItemsStore.subscribe(handleItemsChange)
          unsubscribeGizmo = useGizmoStore.subscribe(handleGizmoChange)
          handleItemsChange(useItemsStore.getState())
          handleGizmoChange(useGizmoStore.getState())
        }

        return () => {
          listeners.delete(listener)
          if (listeners.size > 0) return
          unsubscribeItems?.()
          unsubscribeItems = null
          unsubscribeGizmo?.()
          unsubscribeGizmo = null
          cancelScheduledCatchUp?.()
          cancelScheduledCatchUp = null
          lastObservedHandoffInteractionId = null
        }
      },
    }
  }
</script>

<script lang="ts">
  import { flushSync } from 'svelte'
  import { createSubscriber } from 'svelte/reactivity'
  import Crosshair from 'lucide-svelte/icons/crosshair'
  import Film from 'lucide-svelte/icons/film'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal'
  import Volume2 from 'lucide-svelte/icons/volume-2'
  import Type from 'lucide-svelte/icons/type'
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles'
  import Shapes from 'lucide-svelte/icons/shapes'
  import type { Icon as LucideIcon } from 'lucide-svelte'
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { cn } from '@/shared/ui/cn'
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
  import { Separator } from '@/components/ui/separator'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'
  import { updateItemsTransform } from '@/features/editor/deps/timeline-store'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import { EffectsSection } from '@/features/editor/deps/effects-contract'
  import {
    DEFAULT_PROJECT_FPS,
    DEFAULT_PROJECT_HEIGHT,
    DEFAULT_PROJECT_WIDTH,
  } from '@/shared/projects/defaults'
  import type { ClipInspectorTab } from '@/shared/state/editor'
  import type { TransformProperties } from '@/types/transform'
  import type { VideoItem, CompositionItem } from '@/types/timeline'

  import LayoutSection from './layout-section.svelte'
  import FillSection from './fill-section.svelte'
  import VideoSection from './video-section.svelte'
  import GifSection from './gif-section.svelte'
  import LottieSection from './lottie-section.svelte'
  import ShapeSection from './shape-section.svelte'
  import CornerPinSection from './corner-pin-section.svelte'
  import CompositionControlsSection from './composition-controls-section.svelte'
  import InspectorContributions from '../inspector-contributions.svelte'

  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)

  // A fresh bridge per selection, read like React's useSyncExternalStore.
  const snapshot = $derived.by(() => {
    const bridge = createClipPanelSnapshotBridge(selectedItemIds.current)
    const subscribe = createSubscriber((update) => bridge.subscribe(update))
    return {
      get current() {
        subscribe()
        return bridge.getSnapshot()
      },
    }
  })
  // A new selection replaces the inspector outright: remount only when the
  // selected IDs change, so same-item store updates keep the controls mounted.
  const selectionKey = $derived(selectedItemIds.current.join('\u001f'))

  /**
   * Clip properties panel - shown when one or more clips are selected.
   * Displays and allows editing of clip visual, audio, and effect properties.
   *
   * The store bridge above holds back transform-only snapshots so the large
   * inspector does not join the canvas mouseup commit. The final gizmo handoff
   * keeps the preview exact while these controls catch up.
   */
  const selectedItems = $derived(snapshot.current.selectedItems)
  const audioPanelItems = $derived(snapshot.current.audioPanelItems)

  // Granular selectors with explicit types
  const clipInspectorTab = select(useEditorStore, (s) => s.clipInspectorTab)
  const workspace = select(useEditorStore, (s) => s.workspace)
  const setClipInspectorTab = useEditorStore.getState().setClipInspectorTab
  const handleEditInColor = () => useEditorStore.getState().setWorkspace('color')
  const projectWidth = select(
    useProjectStore,
    (s) => s.currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH,
  )
  const projectHeight = select(
    useProjectStore,
    (s) => s.currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT,
  )
  const projectFps = select(
    useProjectStore,
    (s) => s.currentProject?.metadata.fps ?? DEFAULT_PROJECT_FPS,
  )
  // Canvas settings
  const canvas = $derived({
    width: projectWidth.current,
    height: projectHeight.current,
    fps: projectFps.current,
  })

  // CONSOLIDATED: Single pass for all item type checks
  const itemTypeInfo = $derived(computeItemTypeInfo(selectedItems))

  // Filtered arrays for child components, recomputed only with the selection
  const layoutFillItems = $derived(
    selectedItems.filter((item: TimelineItem) => item.type !== 'audio' && item.type !== 'adjustment'),
  )

  const mediaTransformItems = $derived(
    selectedItems.filter(
      (item): item is VideoItem | CompositionItem =>
        item.type === 'video' || item.type === 'composition',
    ),
  )

  const visualItems = $derived(
    selectedItems.filter((item: TimelineItem) => item.type !== 'audio' && item.type !== 'controller'),
  )
  const paintableLayoutItems = $derived(layoutFillItems.filter((item) => item.type !== 'controller'))

  // Compute aspectLocked from items' transforms
  // If any item has explicit aspectRatioLocked, use that; otherwise use default based on type
  const aspectLocked = $derived.by(() => {
    if (selectedItems.length === 0) return true

    // Check if any item has explicit aspectRatioLocked set
    const firstWithExplicit = selectedItems.find(
      (item: TimelineItem) => item.transform?.aspectRatioLocked !== undefined,
    )
    if (firstWithExplicit) {
      return firstWithExplicit.transform!.aspectRatioLocked!
    }

    // Default based on item types: text/shape = unlocked, others = locked
    return !itemTypeInfo.isOnlyTextOrShape
  })

  // Toggle aspect lock - updates all selected items' transforms
  const handleAspectLockToggle = () => {
    const newValue = !aspectLocked
    const itemIds = selectedItems.map((item: TimelineItem) => item.id)
    updateItemsTransform(itemIds, { aspectRatioLocked: newValue })
  }

  // Handle transform changes
  const handleTransformChange = (ids: string[], updates: Partial<TransformProperties>) => {
    updateItemsTransform(ids, updates)
  }

  // Edit always exposes one clip-level Animation surface. Motion uses the same
  // tab id for its full authoring library, preserving inspector state while the
  // user-facing concepts remain distinct.
  const showVideoTab = $derived(layoutFillItems.length > 0)
  const showAudioTab = $derived(itemTypeInfo.hasAudioItems)
  const showFullMotionLibrary = $derived(workspace.current === 'motion' && itemTypeInfo.hasVisualItems)
  const showMotionTab = $derived(itemTypeInfo.hasVisualItems)
  const showSecondTab = $derived(showAudioTab)
  const showEffectsTab = $derived(visualItems.length > 0)
  const visualItemIds = $derived(visualItems.map((item) => item.id))

  const availableTabs = $derived.by(() => {
    const tabs: ClipInspectorTab[] = []
    if (showVideoTab) tabs.push('video')
    if (showSecondTab) tabs.push('audio')
    if (workspace.current === 'motion') {
      if (showMotionTab) tabs.push('motion')
      if (showEffectsTab) tabs.push('effects')
    } else {
      if (showEffectsTab) tabs.push('effects')
      if (showMotionTab) tabs.push('motion')
    }
    return tabs
  })

  const fallbackTab = $derived(availableTabs[0] ?? 'video')
  const activeTab = $derived(
    availableTabs.includes(clipInspectorTab.current) ? clipInspectorTab.current : fallbackTab,
  )

  $effect(() => {
    if (selectedItems.length === 0) return
    if (clipInspectorTab.current !== activeTab) {
      setClipInspectorTab(activeTab)
    }
  })

  const handleTabChange = (value: string) => {
    // Playback can keep the main thread busy with synchronous GPU canvas
    // handoffs. Commit this discrete inspector interaction before returning
    // to that loop so the requested tab never sits blank until playback
    // pauses.
    flushSync(() => {
      setClipInspectorTab(value as ClipInspectorTab)
    })
  }

  // Per-tab label + icon. Motion presents base properties, animation authoring,
  // then effects; Edit retains its media-first inspector ordering.
  const getTabMeta = (value: ClipInspectorTab): { label: string; icon: typeof LucideIcon } => {
    if (value === 'video') {
      if (workspace.current === 'motion') {
        return {
          label: t('editor.clipPanel.tabProperties', { defaultValue: 'Properties' }),
          icon: SlidersHorizontal,
        }
      }
      if (itemTypeInfo.isOnlyText) return { label: t('editor.clipPanel.tabText'), icon: Type }
      if (itemTypeInfo.isOnlyShape) return { label: t('editor.clipPanel.tabShape'), icon: Shapes }
      if (itemTypeInfo.isOnlyController) {
        return {
          label: t('editor.clipPanel.tabController', { defaultValue: 'Null Object' }),
          icon: Crosshair,
        }
      }
      return { label: t('editor.clipPanel.tabVideo'), icon: Film }
    }
    if (value === 'audio') {
      return { label: t('editor.clipPanel.tabAudio'), icon: Volume2 }
    }
    if (value === 'motion') {
      return {
        label:
          workspace.current === 'motion'
            ? t('editor.clipPanel.tabAnimate', { defaultValue: 'Animate' })
            : t('editor.clipPanel.tabAnimation'),
        icon: WandSparkles,
      }
    }
    return { label: t('editor.clipPanel.tabEffects'), icon: Sparkles }
  }
  const tabGridColsClass = $derived(
    availableTabs.length <= 1
      ? 'grid-cols-1'
      : availableTabs.length === 2
        ? 'grid-cols-2'
        : availableTabs.length === 3
          ? 'grid-cols-3'
          : 'grid-cols-4',
  )

  const motionUsesFullHeight = $derived(activeTab === 'motion' && showFullMotionLibrary)
  // Host and extension sections describe one item, so they show for a single selection.
  const inspectorItem = $derived(selectedItems.length === 1 ? selectedItems[0] : undefined)
</script>

{#key selectionKey}
  {#if selectedItems.length > 0}
    <div class={cn(motionUsesFullHeight ? 'h-full min-h-0' : 'space-y-3')}>
      <!-- Tabbed sections -->
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        class={cn('w-full', motionUsesFullHeight && 'flex h-full min-h-0 flex-col')}
      >
        <TabsList class={cn('grid h-8 w-full shrink-0', tabGridColsClass)}>
          {#each availableTabs as value (value)}
            {@const { label, icon: Icon } = getTabMeta(value)}
            <TabsTrigger {value} class="text-xs gap-1 px-2">
              <Icon class="h-3 w-3" />{label}
            </TabsTrigger>
          {/each}
        </TabsList>

        <!-- Video Tab - visual layout, content, and clip-specific controls. Each
             panel renders its body only while active, as Radix's tabs did. -->
        <TabsContent value="video" class="mt-3">
          {#if activeTab === 'video' && showVideoTab}
            <div
              class="divide-y divide-border [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0"
            >
              {#if showVideoTab}
                <LayoutSection
                  items={layoutFillItems}
                  {mediaTransformItems}
                  {canvas}
                  onTransformChange={handleTransformChange}
                  {aspectLocked}
                  onAspectLockToggle={handleAspectLockToggle}
                />
              {/if}
              <CompositionControlsSection items={selectedItems} />
              {#if itemTypeInfo.hasVideoItems || itemTypeInfo.hasCompositionItems}
                <VideoSection items={selectedItems} />
              {/if}
              {#if paintableLayoutItems.length > 0}
                <FillSection
                  items={paintableLayoutItems}
                  {canvas}
                  onTransformChange={handleTransformChange}
                />
              {/if}
              {#if paintableLayoutItems.length > 0}
                <CornerPinSection items={paintableLayoutItems} />
              {/if}
              {#if itemTypeInfo.hasTextItems}
                {#await loadTextSection() then { TextContentSection }}
                  <TextContentSection items={selectedItems} {canvas} />
                {/await}
              {/if}
              <!-- Text-only: Style (shadow/stroke) lives with the text, not on
                   the Effects tab. Mixed selections keep it under Effects. -->
              {#if itemTypeInfo.isOnlyText}
                {#await loadTextSection() then { TextStyleSection }}
                  <TextStyleSection items={selectedItems} {canvas} />
                {/await}
              {/if}
              {#if itemTypeInfo.hasShapeItems}
                <ShapeSection items={selectedItems} />
              {/if}
              {#if itemTypeInfo.hasSubtitleItems || itemTypeInfo.hasVirtualSubtitleItems}
                {#await loadSubtitleSection() then { SubtitleSection }}
                  <SubtitleSection items={selectedItems} {canvas} />
                {/await}
              {/if}
              {#if itemTypeInfo.hasGifItems}
                <GifSection items={selectedItems} />
              {/if}
              {#if itemTypeInfo.hasLottieItems}
                <LottieSection items={selectedItems} />
              {/if}
            </div>
          {/if}
        </TabsContent>

        <!-- Motion Tab — the composition's single preset, procedural, text
             motion, bake, and saved-animation surface. -->
        <TabsContent value="motion" class="mt-3 min-h-0 flex-1 data-[state=inactive]:hidden">
          {#if showMotionTab && activeTab === 'motion'}
            <div class="flex h-full min-h-0 flex-col">
              <div class="min-h-0 flex-1">
                {#if showFullMotionLibrary}
                  {#await loadAnimationPresetLibrary()}
                    <div class="h-full rounded-md bg-muted/20"></div>
                  {:then { default: AnimationPresetLibrary }}
                    <AnimationPresetLibrary {canvas} embedded />
                  {/await}
                {:else}
                  {#await loadAnimationPresetLibrary()}
                    <div class="h-24 rounded-md bg-muted/20"></div>
                  {:then { default: AnimationPresetLibrary }}
                    <AnimationPresetLibrary
                      {canvas}
                      embedded
                      variant="edit"
                      itemIds={visualItemIds}
                    />
                  {/await}
                {/if}
              </div>
            </div>
          {/if}
        </TabsContent>

        <!-- Audio stays media-specific; text animation lives in Animation. -->
        <TabsContent value="audio" class="space-y-4 mt-3">
          {#if itemTypeInfo.hasAudioItems && activeTab === 'audio'}
            {#await loadAudioSection() then { default: AudioSection }}
              <AudioSection items={audioPanelItems} />
            {/await}
          {/if}
        </TabsContent>

        <!-- Effects Tab - clip effects plus text styling and animation -->
        <TabsContent value="effects" class="space-y-4 mt-3">
          {#if activeTab === 'effects' && itemTypeInfo.hasVisualItems}
            <!-- Explanatory text for adjustment layers -->
            {#if itemTypeInfo.hasAdjustmentItems}
              <div
                class="px-2 py-2 text-xs text-muted-foreground bg-purple-500/10 rounded border border-purple-500/20"
              >
                {t('editor.clipPanel.adjustmentLayerHint')}
              </div>
            {/if}
            <EffectsSection items={visualItems} onEditInColor={handleEditInColor} />
            <!-- Text style + animation only share the Effects tab for mixed
                 selections; a pure-text selection has dedicated Text /
                 Animation tabs. -->
            {#if itemTypeInfo.hasTextItems && !itemTypeInfo.isOnlyText}
              <Separator />
            {/if}
            {#if itemTypeInfo.hasTextItems && !itemTypeInfo.isOnlyText}
              {#await loadTextSection() then { TextEffectsSection }}
                <TextEffectsSection items={selectedItems} {canvas} />
              {/await}
            {/if}
          {/if}
        </TabsContent>
      </Tabs>

      {#if inspectorItem && !motionUsesFullHeight}
        <InspectorContributions item={inspectorItem} />
      {/if}
    </div>
  {/if}
{/key}
