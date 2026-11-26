<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { TextStylePresetLayout } from '@/shared/typography/text-style-presets'

  const TEXT_TEMPLATE_PREVIEW_SHELL =
    'w-full aspect-video rounded-sm border border-border bg-slate-950'

  const TEXT_TEMPLATE_GROUPS: ReadonlyArray<{
    key: TextStylePresetLayout
    labelKey: string
  }> = [
    { key: 'single', labelKey: 'editor.mediaSidebar.textGroupSingle' },
    { key: 'two', labelKey: 'editor.mediaSidebar.textGroupTwoSpans' },
    { key: 'three', labelKey: 'editor.mediaSidebar.textGroupThreeSpans' },
  ]

  const DEFAULT_TEXT_TEMPLATE_LABEL = 'Text'
  const ADD_TEXT_TEMPLATE_LABEL = 'Add Text'

  /** Close is a touch faster than open (exit < entrance), on the same ease-out curve. */
  const OPEN_TRANSITION = 'width 260ms cubic-bezier(0.32, 0.72, 0, 1)'
  const CLOSE_TRANSITION = 'width 200ms cubic-bezier(0.32, 0.72, 0, 1)'
</script>

<script lang="ts">
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import Film from '@lucide/svelte/icons/film'
  import Layers from '@lucide/svelte/icons/layers'
  import Type from '@lucide/svelte/icons/type'
  import Square from '@lucide/svelte/icons/square'
  import Circle from '@lucide/svelte/icons/circle'
  import Triangle from '@lucide/svelte/icons/triangle'
  import Star from '@lucide/svelte/icons/star'
  import Hexagon from '@lucide/svelte/icons/hexagon'
  import Heart from '@lucide/svelte/icons/heart'
  import Pentagon from '@lucide/svelte/icons/pentagon'
  import Blend from '@lucide/svelte/icons/blend'
  import Pen from '@lucide/svelte/icons/pen'
  import Captions from '@lucide/svelte/icons/captions'
  import Sticker from '@lucide/svelte/icons/sticker'
  import WandSparkles from '@lucide/svelte/icons/wand-sparkles'
  import { Button } from '@/components/ui/button'
  import Contribution from '@/components/contribution.svelte'
  import ContributionIcon from '@/components/contribution-icon.svelte'
  import { cn } from '@/shared/ui/cn'
  import { useEditorStore } from '@/shared/state/editor'
  import {
    addEffect,
    addItemOnNewTrack,
    useCompositionNavigationStore,
    useCompositionsStore,
    useItemsStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useSelectionStore } from '@/shared/state/selection'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import { clearMediaDragData, setMediaDragData } from '@/features/editor/deps/media-library'
  import { MediaLibrary } from '@/features/editor/deps/media-library-ui'
  import { importTranscriptEditorPanel } from '@/features/editor/deps/timeline-panels'
  import { LottieBrowserPanel } from '@/features/editor/deps/lottie-browser'
  import TransitionsPanel from './transitions-panel.svelte'
  import {
    createDefaultGradientItem,
    createDefaultShapeItem,
    createDefaultSolidColorItem,
    createOverlayLayerTrack,
    createTextTemplateItem,
    getDefaultGeneratedLayerDurationInFrames,
  } from '@/features/editor/deps/timeline-utils'
  import { addAdjustmentLayer } from '@/features/editor/utils/add-adjustment-layer'
  import type { TextItem, ShapeItem, ShapeType } from '@/types/timeline'
  import { useMaskEditorStore } from '@/features/editor/deps/preview'
  import type { VisualEffect, GpuEffect } from '@/types/effects'
  import { EFFECT_PRESETS } from '@/types/effects'
  import { getGpuEffectDefaultParams } from '@/infrastructure/gpu-effects'
  import { EffectThumbnail, useGpuEffectPreviewData } from '@/features/editor/deps/effects-contract'
  import { createLogger } from '@/shared/logging/logger'
  import { useSettingsStore } from '@/features/editor/deps/settings'
  import { resolveGeneratedLayerCanvasSize } from '@/features/editor/utils/generated-layer-canvas-size'
  import { TEXT_STYLE_PRESETS, type TextStylePreset } from '@/shared/typography/text-style-presets'
  import {
    EDITOR_LAYOUT_CSS_VALUES,
    clampLeftEditorSidebarWidth,
    getEditorLayout,
  } from '@/config/editor-layout'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { maybeEditorUi } from '../editor-ui'
  import { useFeatures } from '../../../extensions/feature-gate.svelte'
  import type { FeatureId, FeatureMode } from '../../../extensions/features'

  const logger = createLogger('MediaSidebar')

  const editorUi = maybeEditorUi()
  const features = useFeatures()

  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  const leftSidebarOpen = select(useEditorStore, (s) => s.leftSidebarOpen)
  const mediaFullColumn = select(useEditorStore, (s) => s.mediaFullColumn)
  const activeTab = select(useEditorStore, (s) => s.activeTab)
  const sidebarWidth = select(useEditorStore, (s) => s.sidebarWidth)

  const toggleLeftSidebar = () => useEditorStore.getState().toggleLeftSidebar()
  const toggleMediaFullColumn = () => useEditorStore.getState().toggleMediaFullColumn()

  let prefersReducedMotion = $state(
    typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  $effect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return
    const update = () => (prefersReducedMotion = query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  })

  // Host and extension panels for this sidebar, as extra tabs after the
  // built-in ones. The editor store's `activeTab` names built-in tabs only
  // (and is persisted per workspace), so a contributed tab is selected here.
  const contributedPanels = $derived(editorUi?.contributions.panels('media') ?? [])
  let activePanelId = $state<string | null>(null)
  let activatedPanelIds = $state.raw<ReadonlySet<string>>(new Set())
  const activePanel = $derived(
    activePanelId ? (contributedPanels.find((panel) => panel.id === activePanelId) ?? null) : null,
  )

  // svelte-ignore state_referenced_locally
  let aiTabActivated = $state(activeTab.current === 'ai')
  // The Lottie panel hits an external API on mount, so keep it unmounted until
  // the tab is first opened; it then stays mounted (state preserved).
  // svelte-ignore state_referenced_locally
  let lottieTabActivated = $state(activeTab.current === 'lottie')
  $effect(() => {
    if (activeBuiltInTab === 'ai') aiTabActivated = true
    if (activeBuiltInTab === 'lottie') lottieTabActivated = true
  })

  // The collapsed panel stays mounted (clipped to 0 width, see NOTE below), so
  // its buttons/inputs would remain in the tab order while invisible. Mark the
  // content `inert` once the close transition settles to pull them out of tab
  // order without yanking focus mid-animation; clear it immediately on open so
  // the panel is interactive as it slides in. Mirrors the right sidebar's
  // contentVisible handoff.
  // svelte-ignore state_referenced_locally
  let contentInert = $state(!leftSidebarOpen.current)
  $effect(() => {
    if (leftSidebarOpen.current) {
      contentInert = false
    } else if (prefersReducedMotion || isResizing) {
      // No transition runs, so no transitionend will settle it.
      contentInert = true
    }
  })

  // NOTE: the heavy media-library subtree is deliberately NOT unmounted when
  // collapsed. It stays mounted and is promoted to its own GPU layer
  // (translateZ on the holder below): rasterized once, then the width /
  // overflow clip reveals it via the compositor — no per-frame repaint and it
  // slides symmetrically open/closed. When collapsed it's clipped to 0 width
  // so it isn't painted.

  // Resize handle logic
  let isResizing = $state(false)
  let startX = 0
  let startWidth = 0
  let suppressGeneratedItemClick = false

  function handleResizeStart(e: MouseEvent) {
    e.preventDefault()
    isResizing = true
    startX = e.clientX
    startWidth = sidebarWidth.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  $effect(() => {
    const layout = editorLayout
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const delta = e.clientX - startX
      const newWidth = clampLeftEditorSidebarWidth(startWidth + delta, layout)
      useEditorStore.getState().setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isResizing) return
      isResizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      isResizing = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  })

  // NOTE: Don't subscribe to tracks, items, currentProject here!
  // These change frequently and would cause re-renders cascading to MediaLibrary/MediaCards
  // Read from store directly in callbacks using getState()

  // Add text item on its own new layer at the playhead, matching what dragging
  // the same preset onto the canvas does (minus the cursor-driven position).
  function handleAddText(presetId?: (typeof TEXT_STYLE_PRESETS)[number]['id']) {
    // Read all needed state from stores directly to avoid subscriptions
    const { tracks } = useItemsStore.getState()
    const { fps } = useTimelineSettingsStore.getState()
    const { activeTrackId, selectItems, setActiveTrack } = useSelectionStore.getState()
    const currentProject = useProjectStore.getState().currentProject

    const newTrack = createOverlayLayerTrack({ tracks, activeTrackId })

    if (!newTrack) {
      logger.warn('No available track for text item')
      return
    }

    const durationInFrames = getDefaultGeneratedLayerDurationInFrames(fps)

    // Get canvas dimensions for initial transform
    const canvasWidth = currentProject?.metadata.width ?? DEFAULT_PROJECT_WIDTH
    const canvasHeight = currentProject?.metadata.height ?? DEFAULT_PROJECT_HEIGHT

    const textStylePreset = presetId
      ? TEXT_STYLE_PRESETS.find((preset) => preset.id === presetId)
      : undefined
    const textItem: TextItem = createTextTemplateItem({
      placement: {
        trackId: newTrack.trackId,
        from: Math.max(0, usePlaybackStore.getState().currentFrame),
        durationInFrames,
        canvasWidth,
        canvasHeight,
        fps,
      },
      label: textStylePreset?.label,
      text: t('editor.textSection.defaultText'),
      textStylePresetId: presetId,
    })

    addItemOnNewTrack(textItem, newTrack.tracks)
    setActiveTrack(newTrack.trackId)
    selectItems([textItem.id])
  }

  // Add shape item on its own new layer at the playhead, matching the canvas drop.
  function handleAddShape(shapeType: ShapeType, shapePreset?: 'solid' | 'gradient') {
    // Read all needed state from stores directly to avoid subscriptions
    const { tracks } = useItemsStore.getState()
    const { fps } = useTimelineSettingsStore.getState()
    const { activeTrackId, selectItems, setActiveTrack } = useSelectionStore.getState()
    const currentProject = useProjectStore.getState().currentProject
    const activeCompositionId = useCompositionNavigationStore.getState().activeCompositionId
    const activeComposition = activeCompositionId
      ? useCompositionsStore.getState().getComposition(activeCompositionId)
      : undefined

    const newTrack = createOverlayLayerTrack({ tracks, activeTrackId })

    if (!newTrack) {
      logger.warn('No available track for shape item')
      return
    }

    const { width: canvasWidth, height: canvasHeight } = resolveGeneratedLayerCanvasSize(
      activeComposition,
      currentProject?.metadata,
    )

    const placement = {
      trackId: newTrack.trackId,
      from: Math.max(0, usePlaybackStore.getState().currentFrame),
      durationInFrames: getDefaultGeneratedLayerDurationInFrames(fps),
      canvasWidth,
      canvasHeight,
      shapeType,
    }
    const shapeItem: ShapeItem =
      shapePreset === 'solid'
        ? createDefaultSolidColorItem(placement)
        : shapePreset === 'gradient'
          ? createDefaultGradientItem(placement)
          : createDefaultShapeItem(placement)

    addItemOnNewTrack(shapeItem, newTrack.tracks)
    setActiveTrack(newTrack.trackId)
    selectItems([shapeItem.id])
  }

  // Add adjustment layer to timeline at the best available position
  // Optionally with pre-applied effects and custom label
  function handleAddAdjustmentLayer(effects?: VisualEffect[], label?: string) {
    addAdjustmentLayer(effects, label)
  }

  // Create adjustment layer with preset effects
  function handleAddPreset(presetId: string) {
    const preset = EFFECT_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    handleAddAdjustmentLayer(preset.effects, preset.name)
  }

  // Add a single GPU effect — to selected clips, or as adjustment layer if nothing selected
  function handleAddGpuEffect(gpuEffectId: string) {
    const { selectedItemIds } = useSelectionStore.getState()
    const { items } = useItemsStore.getState()

    // Find selected visual items (not audio)
    const visualIds = selectedItemIds.filter((id) => {
      const item = items.find((i) => i.id === id)
      return item && item.type !== 'audio'
    })

    if (visualIds.length > 0) {
      const defaults = getGpuEffectDefaultParams(gpuEffectId)
      const effect: GpuEffect = {
        type: 'gpu-effect',
        gpuEffectType: gpuEffectId,
        params: defaults,
      }
      visualIds.forEach((id) => addEffect(id, effect))
    } else {
      // No visual selection — create adjustment layer with this effect
      const defaults = getGpuEffectDefaultParams(gpuEffectId)
      handleAddAdjustmentLayer([{ type: 'gpu-effect', gpuEffectType: gpuEffectId, params: defaults }])
    }
  }

  const { gpuCategories, triggerPreviews } = useGpuEffectPreviewData()
  // Which effect/preset tile is hovered — drives its live sweep animation.
  let hoveredEffectKey = $state<string | null>(null)
  const textTemplatesByLayout = (() => {
    const grouped = {
      single: [] as TextStylePreset[],
      two: [] as TextStylePreset[],
      three: [] as TextStylePreset[],
    }

    for (const preset of TEXT_STYLE_PRESETS) {
      grouped[preset.layout].push(preset)
    }

    return grouped
  })()

  // Category items for the vertical nav
  const categories = $derived([
    { id: 'media' as const, icon: Film, label: t('editor.mediaSidebar.media') },
    { id: 'text' as const, icon: Type, label: t('editor.mediaSidebar.text') },
    { id: 'shapes' as const, icon: Pentagon, label: t('editor.mediaSidebar.shapes') },
    { id: 'effects' as const, icon: Layers, label: t('editor.mediaSidebar.effects') },
    { id: 'transitions' as const, icon: Blend, label: t('editor.mediaSidebar.transitions') },
    { id: 'lottie' as const, icon: Sticker, label: t('lottieBrowser.tabLabel') },
    { id: 'transcript' as const, icon: Captions, label: t('transcript.tabLabel') },
    { id: 'ai' as const, icon: WandSparkles, label: t('editor.mediaSidebar.ai') },
  ])

  type BuiltInTab = (typeof categories)[number]['id']

  const TAB_FEATURES: Record<BuiltInTab, FeatureId[]> = {
    media: ['sidebar.media'],
    text: ['sidebar.text'],
    shapes: ['sidebar.shapes'],
    effects: ['sidebar.effects'],
    transitions: ['sidebar.transitions'],
    lottie: ['sidebar.stickers'],
    transcript: ['sidebar.transcript', 'ai.transcript'],
    ai: ['sidebar.ai', 'ai.generate'],
  }
  const tabModes = $derived(
    Object.fromEntries(
      categories.map((category) => [category.id, features.mode(TAB_FEATURES[category.id])]),
    ) as Record<BuiltInTab, FeatureMode>,
  )

  // The built-in tab shown, or null while a contributed one is. A tab the host
  // hid or locked isn't shown even when it's the one persisted as active.
  const activeBuiltInTab = $derived(
    activePanel
      ? null
      : tabModes[activeTab.current] === 'on'
        ? activeTab.current
        : (categories.find((category) => tabModes[category.id] === 'on')?.id ?? null),
  )

  function selectBuiltInTab(id: BuiltInTab) {
    if (activeBuiltInTab === id && leftSidebarOpen.current) {
      toggleLeftSidebar()
    } else {
      activePanelId = null
      useEditorStore.getState().setActiveTab(id)
      if (!leftSidebarOpen.current) toggleLeftSidebar()
      if (id === 'effects') triggerPreviews()
    }
  }

  function selectContributedPanel(id: string) {
    if (activePanelId === id && leftSidebarOpen.current) {
      toggleLeftSidebar()
    } else {
      activePanelId = id
      if (!activatedPanelIds.has(id)) activatedPanelIds = new Set([...activatedPanelIds, id])
      if (!leftSidebarOpen.current) toggleLeftSidebar()
    }
  }

  const headerLabel = $derived(
    activePanel ? activePanel.title : categories.find((c) => c.id === activeBuiltInTab)?.label,
  )

  function shouldSuppressGeneratedItemClick() {
    if (!suppressGeneratedItemClick) {
      return false
    }

    suppressGeneratedItemClick = false
    return true
  }

  function handleTemplateDragStart(payload: {
    itemType: 'text' | 'shape' | 'adjustment'
    label: string
    textStylePresetId?: (typeof TEXT_STYLE_PRESETS)[number]['id']
    shapeType?: ShapeType
    shapePreset?: 'solid' | 'gradient'
    effects?: VisualEffect[]
  }) {
    return (event: DragEvent) => {
      if (!event.dataTransfer) return
      event.dataTransfer.effectAllowed = 'copy'
      const dragData = {
        type: 'timeline-template' as const,
        ...payload,
      }

      suppressGeneratedItemClick = true
      event.dataTransfer.setData('application/json', JSON.stringify(dragData))
      setMediaDragData(dragData)
    }
  }

  function handleTemplateDragEnd() {
    clearMediaDragData()
    window.setTimeout(() => {
      suppressGeneratedItemClick = false
    }, 0)
  }

  // During a resize-drag we snap (no transition) so width tracks the pointer
  // instead of easing behind it.
  const panelTransition = $derived(
    isResizing || prefersReducedMotion
      ? 'none'
      : leftSidebarOpen.current
        ? OPEN_TRANSITION
        : CLOSE_TRANSITION,
  )

  const shapeButtonClass =
    'flex flex-col items-center justify-center gap-1 p-2 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group'
  const shapeIconBoxClass =
    'w-7 h-7 rounded border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70'
  const effectTileClass =
    'flex flex-col items-center gap-1 p-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group'

  const shapeTemplates = $derived([
    { shapeType: 'rectangle' as const, label: t('editor.shapeSection.typeRectangle'), icon: Square, iconClass: 'w-3.5 h-3.5' },
    { shapeType: 'circle' as const, label: t('editor.shapeSection.typeCircle'), icon: Circle, iconClass: 'w-3.5 h-3.5' },
    { shapeType: 'triangle' as const, label: t('editor.shapeSection.typeTriangle'), icon: Triangle, iconClass: 'w-3.5 h-3.5' },
    { shapeType: 'ellipse' as const, label: t('editor.shapeSection.typeEllipse'), icon: Circle, iconClass: 'w-3.5 h-2.5' },
    { shapeType: 'star' as const, label: t('editor.shapeSection.typeStar'), icon: Star, iconClass: 'w-3.5 h-3.5' },
    { shapeType: 'polygon' as const, label: t('editor.shapeSection.typePolygon'), icon: Hexagon, iconClass: 'w-3.5 h-3.5' },
    { shapeType: 'heart' as const, label: t('editor.shapeSection.typeHeart'), icon: Heart, iconClass: 'w-3.5 h-3.5' },
  ])

  // Loaded on first use; a loader in the script lets static analysis see the import.
  const loadAiTab = () => import('./ai-tab.svelte')
</script>

{#snippet textTemplatePreview(preset?: TextStylePreset)}
  {#if !preset}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center gap-1">
      <Type class="w-3.5 h-3.5 text-muted-foreground/80" />
      <div class="text-[9px] leading-none tracking-wide text-muted-foreground/80 uppercase">Text</div>
    </div>
  {:else if preset.previewKind === 'clean'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5">
      <div class="text-[10px] font-bold tracking-[-0.05em] text-white uppercase leading-none">
        {preset.sample.title}
      </div>
    </div>
  {:else if preset.previewKind === 'lower-third'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} relative overflow-hidden">
      <div class="absolute inset-x-1.5 bottom-1.5 rounded-sm bg-slate-800/95 px-1.5 py-1 text-left">
        <div class="text-[8px] font-semibold leading-none text-slate-50">{preset.sample.title}</div>
        <div class="mt-0.5 text-[7px] leading-none text-slate-300">{preset.sample.subtitle}</div>
      </div>
    </div>
  {:else if preset.previewKind === 'poster'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5">
      <div
        class="text-[12px] tracking-[-0.05em] text-amber-100 uppercase leading-none [text-shadow:0_2px_10px_rgba(127,29,29,0.85)]"
      >
        {preset.sample.title}
      </div>
    </div>
  {:else if preset.previewKind === 'outline-pill'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5">
      <div
        class="rounded-full border border-sky-400/70 bg-slate-900 px-2 py-1 text-[7px] font-bold tracking-[0.18em] text-slate-100 uppercase leading-none"
      >
        {preset.sample.title}
      </div>
    </div>
  {:else if preset.previewKind === 'cinematic'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1">
      <div
        class="text-[11px] tracking-[0.28em] text-amber-100 uppercase leading-none [text-shadow:0_2px_8px_rgba(17,24,39,0.9)]"
      >
        {preset.sample.title}
      </div>
    </div>
  {:else if preset.previewKind === 'quote'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center">
      <div class="w-full rounded-sm bg-slate-800 px-2 py-1.5 text-center">
        <div class="text-[8px] italic leading-tight text-slate-50">{preset.sample.title}</div>
        <div class="mt-0.5 text-[7px] leading-none tracking-[0.08em] text-slate-300">
          {preset.sample.subtitle}
        </div>
      </div>
    </div>
  {:else if preset.previewKind === 'speaker'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} px-1.5 py-1 flex flex-col justify-end">
      <div class="rounded-sm bg-slate-800/95 px-1.5 py-1">
        <div class="text-[8px] font-bold leading-none text-slate-50">{preset.sample.title}</div>
        <div class="mt-0.5 text-[7px] leading-none text-slate-300">{preset.sample.subtitle}</div>
      </div>
    </div>
  {:else if preset.previewKind === 'neon'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center">
      <div class="w-full rounded-sm bg-cyan-950 px-1.5 py-1.5 text-center">
        <div
          class="text-[10px] font-semibold tracking-[0.16em] text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.85)] uppercase"
        >
          {preset.sample.title}
        </div>
      </div>
    </div>
  {:else if preset.previewKind === 'stacked'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1.5">
      <div class="text-[6px] font-semibold tracking-[0.2em] text-amber-300 uppercase">
        {preset.sample.eyebrow}
      </div>
      <div class="mt-1 text-[10px] font-bold tracking-[-0.04em] text-white leading-none">
        {preset.sample.title}
      </div>
      <div class="mt-0.5 text-[7px] leading-none text-slate-300">{preset.sample.subtitle}</div>
    </div>
  {:else if preset.previewKind === 'breaking'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center">
      <div class="w-full rounded-sm bg-slate-900 px-1.5 py-1 text-left">
        <div class="text-[6px] font-bold tracking-[0.18em] text-red-300 uppercase leading-none">
          {preset.sample.eyebrow}
        </div>
        <div class="mt-1 text-[9px] font-bold tracking-[-0.04em] text-slate-50 leading-none">
          {preset.sample.title}
        </div>
        <div class="mt-0.5 text-[7px] font-semibold leading-none text-amber-200">
          {preset.sample.subtitle}
        </div>
      </div>
    </div>
  {:else if preset.previewKind === 'launch'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center">
      <div class="w-full rounded-sm border border-blue-800/80 bg-slate-900 px-1.5 py-1 text-center">
        <div class="text-[6px] font-bold tracking-[0.22em] text-cyan-300 uppercase">
          {preset.sample.eyebrow}
        </div>
        <div class="mt-1 text-[9px] font-bold tracking-[-0.04em] text-slate-50 leading-tight">
          {preset.sample.title}
        </div>
        <div class="mt-0.5 text-[7px] leading-none text-blue-200">{preset.sample.subtitle}</div>
      </div>
    </div>
  {:else if preset.previewKind === 'event'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} p-1.5 flex items-center justify-center">
      <div class="w-full rounded-sm bg-slate-900 px-1.5 py-1 text-center">
        <div class="text-[6px] font-bold tracking-[0.22em] text-rose-300 uppercase">
          {preset.sample.eyebrow}
        </div>
        <div class="mt-1 text-[9px] font-bold text-slate-50 leading-tight">{preset.sample.title}</div>
        <div class="mt-0.5 text-[7px] text-blue-200 leading-none uppercase">
          {preset.sample.subtitle}
        </div>
      </div>
    </div>
  {:else if preset.previewKind === 'badge'}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex items-center justify-center px-1.5">
      <div
        class="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-[7px] font-bold tracking-[0.18em] text-slate-50 uppercase leading-none"
      >
        {preset.sample.title}
      </div>
    </div>
  {:else}
    <div class="{TEXT_TEMPLATE_PREVIEW_SHELL} flex flex-col items-center justify-center px-1.5">
      <div class="text-[10px] font-bold tracking-[-0.04em] text-white uppercase leading-none">
        {preset.sample.title}
      </div>
      <div class="mt-0.5 text-[7px] leading-none text-slate-300 uppercase">
        {preset.sample.subtitle}
      </div>
    </div>
  {/if}
{/snippet}

<div class="flex h-full flex-shrink-0">
  <!-- Vertical Category Bar -->
  <div
    class="panel-header border-r border-border flex flex-col items-center flex-shrink-0"
    style:width={EDITOR_LAYOUT_CSS_VALUES.sidebarRailWidth}
  >
    <!-- Header row - aligned with content panel header -->
    <div
      class="flex items-center justify-center border-b border-border w-full"
      style:height={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderHeight}
    >
      <button
        onclick={toggleLeftSidebar}
        class="rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        style:width={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}
        style:height={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}
        data-tooltip={leftSidebarOpen.current
          ? t('editor.mediaSidebar.collapsePanel')
          : t('editor.mediaSidebar.expandPanel')}
        data-tooltip-side="right"
      >
        {#if leftSidebarOpen.current}
          <ChevronLeft class="w-3.5 h-3.5" />
        {:else}
          <ChevronRight class="w-3.5 h-3.5" />
        {/if}
      </button>
    </div>

    <!-- Category Icons -->
    <div class="flex flex-col gap-1 py-1.5">
      {#each categories.filter((category) => tabModes[category.id] !== 'hidden') as { id, icon: Icon, label } (id)}
        <button
          onclick={() => selectBuiltInTab(id)}
          disabled={tabModes[id] === 'locked'}
          class="w-9 h-9 rounded-lg flex items-center justify-center transition-[transform,background-color,color] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-50 {activeBuiltInTab ===
            id && leftSidebarOpen.current
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}"
          data-tooltip={label}
          data-tooltip-side="right"
        >
          <Icon class="w-4 h-4" />
        </button>
      {/each}
      {#each contributedPanels as panel (panel.id)}
        <button
          onclick={() => selectContributedPanel(panel.id)}
          class="w-9 h-9 rounded-lg flex items-center justify-center transition-[transform,background-color,color] duration-150 active:scale-95 {activePanelId ===
            panel.id && leftSidebarOpen.current
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}"
          data-tooltip={panel.title}
          data-tooltip-side="right"
          aria-label={panel.title}
          data-panel-id={panel.id}
        >
          {#if panel.icon}
            <ContributionIcon icon={panel.icon} class="w-4 h-4" />
          {:else}
            <span class="text-xs font-medium">{panel.title.slice(0, 1).toUpperCase()}</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- Content Panel — width transitions for the open/close toggle. We
       intentionally animate `width` (a layout property, not the cheaper
       transform/opacity) because collapsing must reclaim layout space for the
       preview — transform can't do that. The heavy content is GPU-composited
       (translateZ below) so the clip reveal is compositor-only and does not
       repaint the subtree each frame. -->
  <div
    class="panel-bg border-r border-border overflow-hidden relative"
    style:width="{leftSidebarOpen.current ? sidebarWidth.current : 0}px"
    style:transition={panelTransition}
    ontransitionend={(event) => {
      if (event.target === event.currentTarget && event.propertyName === 'width') {
        if (!leftSidebarOpen.current) contentInert = true
      }
    }}
  >
    <!-- Promote the content to its own GPU layer so the panel's width/clip
         transition reveals it without repainting the subtree each frame. The
         sidebar has no fixed-position descendants, so the containing block this
         establishes is harmless. -->
    <div
      class="h-full min-h-0 flex flex-col"
      style:width="{sidebarWidth.current}px"
      style:transform="translateZ(0)"
      inert={contentInert}
    >
      <!-- Panel Header — sits with the tab content -->
      <div
        class="flex items-center justify-between px-3 border-b border-border flex-shrink-0"
        style:height={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderHeight}
      >
        <span class="text-sm font-medium text-foreground">{headerLabel}</span>
        <Button
          variant="ghost"
          size="icon"
          class="shrink-0"
          style="width: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}; height: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}"
          onclick={toggleMediaFullColumn}
          aria-label={mediaFullColumn.current
            ? t('editor.propertiesSidebar.dockToPreview')
            : t('editor.propertiesSidebar.expandFullColumn')}
          data-tooltip={mediaFullColumn.current
            ? t('editor.propertiesSidebar.dockToPreview')
            : t('editor.propertiesSidebar.expandFullColumn')}
          data-tooltip-side="bottom"
        >
          {#if mediaFullColumn.current}
            <ChevronUp class="w-3 h-3" />
          {:else}
            <ChevronDown class="w-3 h-3" />
          {/if}
        </Button>
      </div>

      <!-- Media Tab - Full Media Library -->
      <div class="min-h-0 flex-1 overflow-hidden {activeBuiltInTab === 'media' ? 'block' : 'hidden'}">
        <MediaLibrary />
      </div>

      <!-- Text Tab -->
      <div
        class="min-h-0 flex-1 overflow-y-auto p-3 {activeBuiltInTab === 'text' ? 'block' : 'hidden'}"
      >
        <div class="space-y-3">
          <div class="space-y-3">
            <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {t('editor.mediaSidebar.templates')}
            </div>
            {#each TEXT_TEMPLATE_GROUPS as group (group.key)}
              {@const presets = textTemplatesByLayout[group.key]}
              {@const showAddText = group.key === 'single'}
              {#if showAddText || presets.length > 0}
                <div class="space-y-1.5">
                  <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t(group.labelKey)}
                  </div>
                  <div class="grid grid-cols-3 gap-1.5">
                    {#if showAddText}
                      <button
                        draggable={true}
                        ondragstart={handleTemplateDragStart({
                          itemType: 'text',
                          label: DEFAULT_TEXT_TEMPLATE_LABEL,
                        })}
                        ondragend={handleTemplateDragEnd}
                        onclick={() => {
                          if (shouldSuppressGeneratedItemClick()) return
                          handleAddText()
                        }}
                        class="flex flex-col items-center gap-1 p-1.5 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
                      >
                        {@render textTemplatePreview()}
                        <span
                          class="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight w-full"
                        >
                          {ADD_TEXT_TEMPLATE_LABEL}
                        </span>
                      </button>
                    {/if}
                    {#each presets as preset (preset.id)}
                      <button
                        draggable={true}
                        ondragstart={handleTemplateDragStart({
                          itemType: 'text',
                          label: preset.label,
                          textStylePresetId: preset.id,
                        })}
                        ondragend={handleTemplateDragEnd}
                        onclick={() => {
                          if (shouldSuppressGeneratedItemClick()) return
                          handleAddText(preset.id)
                        }}
                        class={cn(
                          'flex flex-col items-center gap-1 p-1.5 rounded-md border border-border',
                          'bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50',
                          'transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group',
                        )}
                      >
                        {@render textTemplatePreview(preset)}
                        <span
                          class="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight w-full"
                        >
                          {preset.label}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

      <!-- Shapes Tab -->
      <div
        class="min-h-0 flex-1 overflow-y-auto p-3 {activeBuiltInTab === 'shapes' ? 'block' : 'hidden'}"
      >
        <div class="grid grid-cols-3 gap-1.5">
          <button
            draggable={true}
            ondragstart={handleTemplateDragStart({
              itemType: 'shape',
              label: t('editor.shapeSection.solidColor'),
              shapeType: 'rectangle',
              shapePreset: 'solid',
            })}
            ondragend={handleTemplateDragEnd}
            onclick={() => {
              if (shouldSuppressGeneratedItemClick()) return
              handleAddShape('rectangle', 'solid')
            }}
            class={shapeButtonClass}
          >
            <div
              class="w-7 h-7 rounded border border-border bg-[#2d2d2d] shadow-inner group-hover:border-primary/50"
            ></div>
            <span class="text-[9px] text-muted-foreground group-hover:text-foreground">
              {t('editor.shapeSection.solidColor')}
            </span>
          </button>

          <button
            draggable={true}
            ondragstart={handleTemplateDragStart({
              itemType: 'shape',
              label: t('editor.shapeSection.gradient'),
              shapeType: 'rectangle',
              shapePreset: 'gradient',
            })}
            ondragend={handleTemplateDragEnd}
            onclick={() => {
              if (shouldSuppressGeneratedItemClick()) return
              handleAddShape('rectangle', 'gradient')
            }}
            class={shapeButtonClass}
          >
            <div
              class="w-7 h-7 rounded border border-border bg-gradient-to-r from-blue-500 to-violet-500 shadow-inner group-hover:border-primary/50"
            ></div>
            <span class="text-[9px] text-muted-foreground group-hover:text-foreground">
              {t('editor.shapeSection.gradient')}
            </span>
          </button>

          {#each shapeTemplates as shape (shape.shapeType)}
            {@const Icon = shape.icon}
            <button
              draggable={true}
              ondragstart={handleTemplateDragStart({
                itemType: 'shape',
                label: shape.label,
                shapeType: shape.shapeType,
              })}
              ondragend={handleTemplateDragEnd}
              onclick={() => {
                if (shouldSuppressGeneratedItemClick()) return
                handleAddShape(shape.shapeType)
              }}
              class={shapeButtonClass}
            >
              <div class={shapeIconBoxClass}>
                <Icon class="{shape.iconClass} text-muted-foreground group-hover:text-foreground" />
              </div>
              <span class="text-[9px] text-muted-foreground group-hover:text-foreground">
                {shape.label}
              </span>
            </button>
          {/each}

          <button
            onclick={() => useMaskEditorStore.getState().startShapePenMode()}
            class={shapeButtonClass}
            title={t('editor.mediaSidebar.penToolHint')}
          >
            <div class={shapeIconBoxClass}>
              <Pen class="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
            </div>
            <span class="text-[9px] text-muted-foreground group-hover:text-foreground">
              {t('editor.mediaSidebar.pen')}
            </span>
          </button>
        </div>
      </div>

      <!-- Effects Tab -->
      <div
        class="min-h-0 flex-1 overflow-y-auto p-3 {activeBuiltInTab === 'effects' ? 'block' : 'hidden'}"
      >
        <div class="space-y-3">
          <!-- Blank Adjustment Layer -->
          <button
            draggable={true}
            ondragstart={handleTemplateDragStart({
              itemType: 'adjustment',
              label: t('editor.mediaSidebar.adjustmentLayer'),
            })}
            ondragend={handleTemplateDragEnd}
            onclick={() => {
              if (shouldSuppressGeneratedItemClick()) return
              handleAddAdjustmentLayer()
            }}
            class="w-full flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 hover:border-primary/50 transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.98] group"
          >
            <div
              class="w-8 h-8 rounded-md border border-border bg-secondary/50 flex items-center justify-center group-hover:bg-secondary/70 flex-shrink-0"
            >
              <Layers class="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
            </div>
            <div class="text-left">
              <div class="text-xs text-muted-foreground group-hover:text-foreground">
                {t('editor.mediaSidebar.blankAdjustmentLayer')}
              </div>
            </div>
          </button>

          <!-- Presets -->
          <div>
            <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
              {t('editor.mediaSidebar.presets')}
            </div>
            <div class="grid grid-cols-3 gap-1.5">
              {#each EFFECT_PRESETS as preset (preset.id)}
                <button
                  draggable={true}
                  ondragstart={handleTemplateDragStart({
                    itemType: 'adjustment',
                    label: preset.name,
                    effects: preset.effects,
                  })}
                  ondragend={handleTemplateDragEnd}
                  onmouseenter={() => (hoveredEffectKey = `preset:${preset.id}`)}
                  onmouseleave={() => {
                    if (hoveredEffectKey === `preset:${preset.id}`) hoveredEffectKey = null
                  }}
                  onclick={() => {
                    if (shouldSuppressGeneratedItemClick()) return
                    handleAddPreset(preset.id)
                  }}
                  class={effectTileClass}
                >
                  <EffectThumbnail
                    effects={preset.effects}
                    active={hoveredEffectKey === `preset:${preset.id}`}
                    class="w-full aspect-video rounded-sm"
                  />
                  <span
                    class="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight"
                  >
                    {preset.name}
                  </span>
                </button>
              {/each}
            </div>
          </div>

          <!-- GPU Effects by Category -->
          {#each gpuCategories as { category, effects: catEffects } (category)}
            <div>
              <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                {category}
              </div>
              <div class="grid grid-cols-3 gap-1.5">
                {#each catEffects as def (def.id)}
                  <button
                    draggable={true}
                    ondragstart={handleTemplateDragStart({
                      itemType: 'adjustment',
                      label: def.name,
                      effects: [
                        {
                          type: 'gpu-effect',
                          gpuEffectType: def.id,
                          params: getGpuEffectDefaultParams(def.id),
                        },
                      ],
                    })}
                    ondragend={handleTemplateDragEnd}
                    onmouseenter={() => (hoveredEffectKey = def.id)}
                    onmouseleave={() => {
                      if (hoveredEffectKey === def.id) hoveredEffectKey = null
                    }}
                    onclick={() => {
                      if (shouldSuppressGeneratedItemClick()) return
                      handleAddGpuEffect(def.id)
                    }}
                    class={effectTileClass}
                  >
                    <EffectThumbnail
                      effectId={def.id}
                      active={hoveredEffectKey === def.id}
                      class="w-full aspect-video rounded-sm"
                    />
                    <span
                      class="text-[9px] text-muted-foreground group-hover:text-foreground text-center leading-tight truncate w-full"
                    >
                      {def.name}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Transitions Tab -->
      <div
        class="min-h-0 flex-1 overflow-hidden {activeBuiltInTab === 'transitions' ? 'block' : 'hidden'}"
      >
        {#if activeBuiltInTab === 'transitions'}
          <TransitionsPanel />
        {/if}
      </div>

      <!-- Lottie Browser Tab -->
      <div class="min-h-0 flex-1 overflow-hidden {activeBuiltInTab === 'lottie' ? 'block' : 'hidden'}">
        {#if lottieTabActivated}
          <LottieBrowserPanel />
        {/if}
      </div>

      <!-- Transcript Tab -->
      <div
        class="min-h-0 flex-1 overflow-hidden {activeBuiltInTab === 'transcript' ? 'block' : 'hidden'}"
      >
        {#if activeBuiltInTab === 'transcript'}
          {#await importTranscriptEditorPanel() then { default: TranscriptEditorPanel }}
            <TranscriptEditorPanel active />
          {/await}
        {/if}
      </div>

      <!-- AI Tab -->
      <div class="min-h-0 flex-1 overflow-hidden {activeBuiltInTab === 'ai' ? 'block' : 'hidden'}">
        {#if aiTabActivated}
          {#await loadAiTab() then { default: AiTab }}
            <AiTab />
          {/await}
        {/if}
      </div>

      <!-- Host and extension panels: mounted on first open, then kept, like Lottie. -->
      {#if editorUi}
        {#each contributedPanels as panel (panel.id)}
          {#if activatedPanelIds.has(panel.id)}
            <div
              class="min-h-0 flex-1 overflow-y-auto {activePanelId === panel.id ? 'block' : 'hidden'}"
              data-panel-id={panel.id}
            >
              <Contribution content={panel.content} context={{ editor: editorUi.editor }} class="h-full" />
            </div>
          {/if}
        {/each}
      {/if}
    </div>
    <!-- Resize Handle -->
    {#if leftSidebarOpen.current}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        data-resize-handle
        onmousedown={handleResizeStart}
        class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary/50 transition-colors z-10"
      ></div>
    {/if}
  </div>
</div>
