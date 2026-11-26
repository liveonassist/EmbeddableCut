<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  type PreviewChrome = 'edit' | 'color'

  const DEFAULT_EMPTY_TIMELINE_SECONDS = 10
  const PREVIEW_RESIZE_MIN_UPDATE_MS = 33
  const SPLIT_DRAG_MIN_UPDATE_MS = 33
  const PREVIEW_SOURCE_SPLIT_DEFAULT_PERCENT = 50
  const PREVIEW_SCOPES_SPLIT_DEFAULT_PERCENT = 32
  const PREVIEW_SIDE_PANEL_MIN_PERCENT = 22
  const PREVIEW_SIDE_PANEL_MAX_PERCENT = 55

  interface PreviewAreaProps {
    project: {
      width: number
      height: number
      fps: number
      backgroundColor?: string
    }
    durationInFrames?: number
    preferProjectStoreMetadata?: boolean
  }
</script>

<script lang="ts">
  import Columns2 from '@lucide/svelte/icons/columns-2'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import {
    VideoPreview,
    PlaybackControls,
    AlignmentToolbar,
    TimecodeDisplay,
    PreviewZoomControls,
    importSourceMonitor,
    importInlineSourcePreview,
    importInlineCompositionPreview,
    importColorScopesMonitor,
    useMaskEditorStore,
    useItemsStore,
  } from '@/features/editor/deps/preview'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import { useSettingsStore } from '@/features/editor/deps/settings'
  import { useEditorStore } from '@/shared/state/editor'
  import { EDITOR_LAYOUT_CSS_VALUES, getEditorLayout } from '@/config/editor-layout'
  import InteractionLockRegion from './interaction-lock-region.svelte'
  import { Button } from '@/components/ui/button'
  import ErrorBoundary from '@/components/error-boundary.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import ShuttleIndicator from '@/shared/ui/shuttle-indicator.svelte'

  /**
   * Preview Area Component
   *
   * Modular composition of preview-related components:
   * - VideoPreview: Canvas with grid, rulers, frame counter
   * - PlaybackControls: Transport controls
   * - TimecodeDisplay: Current time display
   * - PreviewZoomControls: Fit-to-panel zoom control
   */
  let { project, durationInFrames, preferProjectStoreMetadata = true }: PreviewAreaProps = $props()

  let previewContainer: HTMLDivElement | undefined = $state()
  let containerSize = $state.raw({ width: 0, height: 0 })
  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  const isMaskEditingActive = select(useMaskEditorStore, (s) => s.isEditing)
  const isPenModeActive = select(useMaskEditorStore, (s) => s.penMode)
  const isShapePenModeActive = select(useMaskEditorStore, (s) => s.shapePenMode)
  const editingItemId = select(useMaskEditorStore, (s) => s.editingItemId)
  const selectedVertexIndices = select(useMaskEditorStore, (s) => s.selectedVertexIndices)
  const selectedVertexIndex = select(useMaskEditorStore, (s) => s.selectedVertexIndex)
  const penVertexCount = select(useMaskEditorStore, (s) => s.penVertices.length)
  const previewVertexCount = select(useMaskEditorStore, (s) => s.previewVertices?.length ?? 0)
  const editVertexCount = $derived.by(() => {
    const id = editingItemId.current
    return select(useItemsStore, (s) => {
      if (!id) return 0
      const item = s.itemById[id]
      return item?.type === 'shape' && item.shapeType === 'path' ? (item.pathVertices?.length ?? 0) : 0
    })
  })

  // Read current project from store for live updates (e.g., dimension swaps)
  // Use granular selectors to avoid re-renders when unrelated properties change
  const projectWidth = select(useProjectStore, (s) => s.currentProject?.metadata.width)
  const projectHeight = select(useProjectStore, (s) => s.currentProject?.metadata.height)
  const projectFps = select(useProjectStore, (s) => s.currentProject?.metadata.fps)
  const projectBgColor = select(useProjectStore, (s) => s.currentProject?.metadata.backgroundColor)

  const width = $derived(
    preferProjectStoreMetadata ? (projectWidth.current ?? project.width) : project.width,
  )
  const height = $derived(
    preferProjectStoreMetadata ? (projectHeight.current ?? project.height) : project.height,
  )
  const fps = $derived(preferProjectStoreMetadata ? (projectFps.current ?? project.fps) : project.fps)
  const backgroundColor = $derived(
    preferProjectStoreMetadata
      ? (projectBgColor.current ?? project.backgroundColor ?? '#000000')
      : (project.backgroundColor ?? '#000000'),
  )

  // Use the precomputed index from items-store; returns 0 when there are no items.
  const maxItemEndFrame = select(useItemsStore, (s) => s.maxItemEndFrame)
  const totalFrames = $derived(
    durationInFrames !== undefined
      ? Math.max(1, Math.round(durationInFrames))
      : maxItemEndFrame.current > 0
        ? maxItemEndFrame.current
        : fps * DEFAULT_EMPTY_TIMELINE_SECONDS,
  )
  const isPathEditModeActive = $derived(isMaskEditingActive.current && !isPenModeActive.current)
  const canFinishPenPath = $derived(isShapePenModeActive.current && penVertexCount.current >= 2)
  const selectedVertexCount = $derived(selectedVertexIndices.current.length)
  const hasSelectedVertex = $derived(selectedVertexCount > 0)
  const remainingPenPoints = $derived(Math.max(0, 2 - penVertexCount.current))
  const displayedEditVertexCount = $derived(previewVertexCount.current || editVertexCount.current)
  const penModeHint = $derived(
    canFinishPenPath
      ? t('editor.shapeSection.penFinishHint')
      : penVertexCount.current === 0
        ? 'Click in the preview to place your first point.'
        : `Add ${remainingPenPoints} more ${remainingPenPoints === 1 ? 'point' : 'points'} to finish.`,
  )
  const editModeHint = $derived(
    displayedEditVertexCount > 0
      ? 'Drag points, handles, or the path body to adjust the shape.'
      : 'Drag inside the path to move it.',
  )
  const selectedVertexHint = $derived(
    selectedVertexCount === 0
      ? 'Select a point to enable corner and bezier conversion.'
      : selectedVertexCount === 1 && selectedVertexIndex.current !== null
        ? `Point ${selectedVertexIndex.current + 1} selected for knot conversion.`
        : `${selectedVertexCount} points selected for knot conversion.`,
  )

  // Measure preview container size for zoom calculations
  $effect(() => {
    const element = previewContainer
    if (!element) return
    const previewPadding = editorLayout.previewPadding
    let rafId: number | null = null
    let lastUpdateTs = 0

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      const nextWidth = Math.max(0, Math.floor(rect.width - previewPadding))
      const nextHeight = Math.max(0, Math.floor(rect.height - previewPadding))

      // Bail out when dimensions are unchanged to avoid redundant updates.
      if (containerSize.width === nextWidth && containerSize.height === nextHeight) return
      containerSize = { width: nextWidth, height: nextHeight }
    }

    const scheduleUpdate = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        const now = performance.now()
        if (now - lastUpdateTs < PREVIEW_RESIZE_MIN_UPDATE_MS) {
          rafId = requestAnimationFrame(() => {
            rafId = null
            lastUpdateTs = performance.now()
            updateSize()
          })
          return
        }
        rafId = null
        lastUpdateTs = now
        updateSize()
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(scheduleUpdate)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  })

  const liveProject = $derived({ width, height, fps, backgroundColor })

  const sourcePreviewMediaId = select(useEditorStore, (s) => s.sourcePreviewMediaId)
  const colorScopesOpen = select(useEditorStore, (s) => s.colorScopesOpen)
  const workspace = select(useEditorStore, (s) => s.workspace)
  const scopesPanelOpen = $derived(workspace.current === 'color' && colorScopesOpen.current)

  // Skim previews over the program monitor.
  const mediaSkimPreviewMediaId = select(useEditorStore, (s) => s.mediaSkimPreviewMediaId)
  const mediaSkimPreviewFrame = select(useEditorStore, (s) => s.mediaSkimPreviewFrame)
  const compoundClipSkimPreviewCompositionId = select(
    useEditorStore,
    (s) => s.compoundClipSkimPreviewCompositionId,
  )
  const compoundClipSkimPreviewFrame = select(useEditorStore, (s) => s.compoundClipSkimPreviewFrame)

  // Program shuttle indicator
  const isPlaying = select(usePlaybackStore, (state) => state.isPlaying)
  const playbackRate = select(usePlaybackStore, (state) => state.playbackRate)
  const transportMode = select(usePlaybackStore, (state) => state.transportMode)

  let sourceSplitPercent = $state(PREVIEW_SOURCE_SPLIT_DEFAULT_PERCENT)
  let scopesSplitPercent = $state(PREVIEW_SCOPES_SPLIT_DEFAULT_PERCENT)
  let isPanelDragging = $state(false)

  let splitContainer: HTMLDivElement | undefined = $state()
  let isDraggingSourceSplit = false
  let pendingSourceSplitPercent: number | null = null
  let sourceSplitDragRaf: number | null = null
  let lastSourceSplitDragUpdateTs = 0
  let sourceSplitDragCleanup: (() => void) | null = null
  let isDraggingScopesSplit = false
  let pendingScopesSplitPercent: number | null = null
  let scopesSplitDragRaf: number | null = null
  let lastScopesSplitDragUpdateTs = 0
  let scopesSplitDragCleanup: (() => void) | null = null

  function handleCloseSourceMonitor() {
    useEditorStore.getState().setSourcePreviewMediaId(null)
  }

  function handleCloseColorScopes() {
    useEditorStore.getState().setColorScopesOpen(false)
  }

  // Scopes get their absolute percentage (clamped independently)
  const displayedScopesSplitPercent = $derived(
    scopesPanelOpen
      ? Math.max(
          PREVIEW_SIDE_PANEL_MIN_PERCENT,
          Math.min(PREVIEW_SIDE_PANEL_MAX_PERCENT, scopesSplitPercent),
        )
      : 0,
  )

  // sourceSplitPercent is a ratio (0-100) of the source+program space.
  // Both panels shrink proportionally when scopes open.
  const availableForSourceProgram = $derived(100 - displayedScopesSplitPercent)
  const proportionalSource = $derived((sourceSplitPercent / 100) * availableForSourceProgram)
  const displayedSourceSplitPercent = $derived(
    sourcePreviewMediaId.current
      ? Math.max(
          PREVIEW_SIDE_PANEL_MIN_PERCENT,
          Math.min(availableForSourceProgram - PREVIEW_SIDE_PANEL_MIN_PERCENT, proportionalSource),
        )
      : 0,
  )

  const sourceResetPercent = PREVIEW_SOURCE_SPLIT_DEFAULT_PERCENT
  const scopesResetPercent = PREVIEW_SCOPES_SPLIT_DEFAULT_PERCENT

  function handleResetSourceSplit() {
    sourceSplitPercent = sourceResetPercent
  }

  function handleResetScopesSplit() {
    scopesSplitPercent = scopesResetPercent
  }

  function handleSourceSplitDragStart(event: MouseEvent) {
    event.preventDefault()
    isDraggingSourceSplit = true
    isPanelDragging = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMouseMove = (mouseEvent: MouseEvent) => {
      if (!isDraggingSourceSplit || !splitContainer) return
      const rect = splitContainer.getBoundingClientRect()
      const absPercent = ((mouseEvent.clientX - rect.left) / rect.width) * 100
      // Convert absolute position to ratio of source+program space
      const available = 100 - (scopesPanelOpen ? displayedScopesSplitPercent : 0)
      pendingSourceSplitPercent =
        available > 0 ? Math.max(0, Math.min(100, (absPercent / available) * 100)) : 50

      if (sourceSplitDragRaf !== null) return
      sourceSplitDragRaf = requestAnimationFrame(() => {
        sourceSplitDragRaf = null
        const now = performance.now()
        if (now - lastSourceSplitDragUpdateTs < SPLIT_DRAG_MIN_UPDATE_MS) {
          return
        }
        lastSourceSplitDragUpdateTs = now
        if (pendingSourceSplitPercent !== null) {
          sourceSplitPercent = pendingSourceSplitPercent
        }
      })
    }

    const cleanup = () => {
      if (pendingSourceSplitPercent !== null) {
        sourceSplitPercent = pendingSourceSplitPercent
      }
      if (sourceSplitDragRaf !== null) {
        cancelAnimationFrame(sourceSplitDragRaf)
        sourceSplitDragRaf = null
      }
      isDraggingSourceSplit = false
      pendingSourceSplitPercent = null
      isPanelDragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      sourceSplitDragCleanup = null
    }

    const handleMouseUp = () => {
      cleanup()
    }

    sourceSplitDragCleanup = cleanup
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  function handleScopesSplitDragStart(event: MouseEvent) {
    event.preventDefault()
    isDraggingScopesSplit = true
    isPanelDragging = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const clampScopes = (percent: number) =>
      Math.max(PREVIEW_SIDE_PANEL_MIN_PERCENT, Math.min(PREVIEW_SIDE_PANEL_MAX_PERCENT, percent))

    const handleMouseMove = (mouseEvent: MouseEvent) => {
      if (!isDraggingScopesSplit || !splitContainer) return
      const rect = splitContainer.getBoundingClientRect()
      pendingScopesSplitPercent = ((rect.right - mouseEvent.clientX) / rect.width) * 100

      if (scopesSplitDragRaf !== null) return
      scopesSplitDragRaf = requestAnimationFrame(() => {
        scopesSplitDragRaf = null
        const now = performance.now()
        if (now - lastScopesSplitDragUpdateTs < SPLIT_DRAG_MIN_UPDATE_MS) {
          return
        }
        lastScopesSplitDragUpdateTs = now
        if (pendingScopesSplitPercent !== null) {
          scopesSplitPercent = clampScopes(pendingScopesSplitPercent)
        }
      })
    }

    const cleanup = () => {
      if (pendingScopesSplitPercent !== null) {
        scopesSplitPercent = clampScopes(pendingScopesSplitPercent)
      }
      if (scopesSplitDragRaf !== null) {
        cancelAnimationFrame(scopesSplitDragRaf)
        scopesSplitDragRaf = null
      }
      isDraggingScopesSplit = false
      pendingScopesSplitPercent = null
      isPanelDragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      scopesSplitDragCleanup = null
    }

    const handleMouseUp = () => {
      cleanup()
    }

    scopesSplitDragCleanup = cleanup
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  $effect(() => {
    return () => {
      sourceSplitDragCleanup?.()
      scopesSplitDragCleanup?.()
    }
  })

  const hasSidePanels = $derived(!!sourcePreviewMediaId.current || scopesPanelOpen)
  const previewChrome: PreviewChrome = $derived(workspace.current === 'color' ? 'color' : 'edit')
  const programPanelPercent = $derived(
    Math.max(0, 100 - displayedSourceSplitPercent - displayedScopesSplitPercent),
  )
  const pathControlsHeight = `calc(1.75rem + ${EDITOR_LAYOUT_CSS_VALUES.previewControlsHeight})`
</script>

{#snippet previewSplitHandle(
  onmousedown: (event: MouseEvent) => void,
  onReset: () => void,
  showReset: boolean,
  resetLabel: string,
  resetTooltip: string,
)}
  <div
    role="presentation"
    {onmousedown}
    class="w-1.5 cursor-col-resize hover:bg-primary/50 active:bg-primary/70 bg-border transition-colors flex-shrink-0 relative group"
  >
    {#if showReset}
      <button
        onmousedown={(event) => event.stopPropagation()}
        onclick={onReset}
        class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-primary hover:border-primary hover:[&>svg]:text-primary-foreground"
        aria-label={resetLabel}
        data-tooltip={resetTooltip}
      >
        <Columns2 class="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    {/if}
  </div>
{/snippet}

<div bind:this={splitContainer} class="flex-1 flex min-h-0 min-w-0 relative" role="region" aria-label="Preview area">
  {#if sourcePreviewMediaId.current}
    {@const mediaId = sourcePreviewMediaId.current}
    <InteractionLockRegion
      locked={isMaskEditingActive.current}
      class="h-full"
      overlayClass="rounded-none"
      style="width: {displayedSourceSplitPercent}%"
    >
      <div class="flex h-full flex-col min-w-0">
        {#await importSourceMonitor() then { default: SourceMonitor }}
          {#key mediaId}
            <SourceMonitor {mediaId} onClose={handleCloseSourceMonitor} />
          {/key}
        {/await}
      </div>
    </InteractionLockRegion>
    <InteractionLockRegion locked={isMaskEditingActive.current} overlayClass="rounded-none">
      {@render previewSplitHandle(
        handleSourceSplitDragStart,
        handleResetSourceSplit,
        Math.abs(displayedSourceSplitPercent - sourceResetPercent) > 0.5,
        'Reset source monitor width',
        'Reset Source Monitor Width',
      )}
    </InteractionLockRegion>
  {/if}

  <div
    class={`flex flex-col min-w-0 min-h-0 ${hasSidePanels ? '' : 'flex-1'}`}
    style:width={hasSidePanels ? `${programPanelPercent}%` : undefined}
    role="region"
    aria-label="Program monitor"
  >
    {#if hasSidePanels}
      <div
        class="border-b border-border flex items-center px-3 flex-shrink-0"
        style:height={EDITOR_LAYOUT_CSS_VALUES.previewSplitHeaderHeight}
      >
        <span class="text-xs text-muted-foreground">Program</span>
      </div>
    {/if}

    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <div
        bind:this={previewContainer}
        class="flex-1 min-h-0 relative overflow-hidden"
        aria-label="Preview canvas region"
      >
        <!-- Program preview surface -->
        <ErrorBoundary level="component">
          <div class="relative w-full h-full">
            <VideoPreview
              project={liveProject}
              {containerSize}
              suspendOverlay={isPanelDragging}
              chrome={previewChrome}
            />
            {#if compoundClipSkimPreviewCompositionId.current}
              <div class="absolute inset-0 z-40 bg-video-preview-background">
                {#await importInlineCompositionPreview() then { default: InlineCompositionPreview }}
                  <InlineCompositionPreview
                    compositionId={compoundClipSkimPreviewCompositionId.current}
                    seekFrame={compoundClipSkimPreviewFrame.current}
                    {containerSize}
                  />
                {/await}
              </div>
            {:else if mediaSkimPreviewMediaId.current}
              <div class="absolute inset-0 z-40 bg-video-preview-background">
                {#await importInlineSourcePreview() then { default: InlineSourcePreview }}
                  <InlineSourcePreview
                    mediaId={mediaSkimPreviewMediaId.current}
                    seekFrame={mediaSkimPreviewFrame.current}
                    {containerSize}
                  />
                {/await}
              </div>
            {/if}
          </div>
        </ErrorBoundary>
      </div>

      {#if isPenModeActive.current}
        <div
          class="border-t border-border panel-header flex items-center px-3 flex-shrink-0 gap-3 overflow-hidden"
          style:height={pathControlsHeight}
          role="toolbar"
          aria-label="Path pen controls"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-500">Pen Tool</span>
              <span class="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-600"
                >{penVertexCount.current} {penVertexCount.current === 1 ? 'point' : 'points'}</span
              >
            </div>
            <span class="min-w-0 truncate text-xs text-muted-foreground">{penModeHint}</span>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2">
            <span class="hidden text-[11px] text-muted-foreground lg:inline">
              Backspace removes the last point.
            </span>
            <Button
              type="button"
              size="sm"
              class="h-8 px-3 text-[11px]"
              disabled={!canFinishPenPath}
              onclick={() => useMaskEditorStore.getState().requestFinishPenMode()}
            >
              {t('editor.shapeSection.finishOpenPath')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              class="h-8 px-3 text-[11px]"
              onclick={() => useMaskEditorStore.getState().requestCancelPenMode()}
            >
              Cancel
            </Button>
          </div>
        </div>
      {:else if isPathEditModeActive}
        <div
          class="border-t border-border panel-header flex items-center px-3 flex-shrink-0 gap-3 overflow-hidden"
          style:height={pathControlsHeight}
          role="toolbar"
          aria-label="Path edit controls"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-500">Path Edit</span>
              <span class="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-600"
                >{displayedEditVertexCount} {displayedEditVertexCount === 1 ? 'point' : 'points'}</span
              >
            </div>
            <span class="min-w-0 truncate text-xs text-muted-foreground">{editModeHint}</span>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2">
            <span class="hidden text-[11px] text-muted-foreground xl:inline">
              Double-click an edge to add a point. Drag empty space to box-select points.
            </span>
            <span class="hidden text-[11px] text-muted-foreground 2xl:inline">{selectedVertexHint}</span>
            <Button
              type="button"
              size="sm"
              variant={hasSelectedVertex ? 'secondary' : 'outline'}
              class="h-8 px-3 text-[11px]"
              disabled={!hasSelectedVertex}
              onclick={() => useMaskEditorStore.getState().requestConvertSelectedVertex('corner')}
            >
              Corner
            </Button>
            <Button
              type="button"
              size="sm"
              variant={hasSelectedVertex ? 'secondary' : 'outline'}
              class="h-8 px-3 text-[11px]"
              disabled={!hasSelectedVertex}
              onclick={() => useMaskEditorStore.getState().requestConvertSelectedVertex('bezier')}
            >
              Bezier
            </Button>
            <Button
              type="button"
              size="sm"
              class="h-8 px-3 text-[11px]"
              onclick={() => useMaskEditorStore.getState().stopEditing()}
            >
              Done
            </Button>
          </div>
        </div>
      {:else}
        <InteractionLockRegion locked={false} overlayClass="rounded-none">
          <div class="flex flex-col flex-shrink-0">
            {#if previewChrome === 'edit'}
              <div
                class="border-t border-border panel-header flex h-7 items-center justify-center overflow-hidden px-3"
              >
                <div class="flex items-center gap-0">
                  <AlignmentToolbar projectSize={{ width, height }} />
                </div>
              </div>
            {/if}

            <!-- Playback controls row -->
            <div
              class="@container border-t border-border panel-header relative flex items-center px-3 overflow-hidden"
              style:height={EDITOR_LAYOUT_CSS_VALUES.previewControlsHeight}
            >
              <div class="flex flex-shrink-0 items-center gap-2">
                <TimecodeDisplay {fps} {totalFrames} />
                <ShuttleIndicator
                  active={isPlaying.current && transportMode.current === 'shuttle'}
                  playbackRate={playbackRate.current}
                />
              </div>

              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="flex items-center gap-2.5 pointer-events-auto">
                  <PlaybackControls {totalFrames} {fps} />
                </div>
              </div>

              <div class="ml-auto flex-shrink-0">
                <PreviewZoomControls />
              </div>
            </div>
          </div>
        </InteractionLockRegion>
      {/if}
    </div>
  </div>

  {#if scopesPanelOpen}
    <InteractionLockRegion locked={isMaskEditingActive.current} overlayClass="rounded-none">
      {@render previewSplitHandle(
        handleScopesSplitDragStart,
        handleResetScopesSplit,
        Math.abs(displayedScopesSplitPercent - scopesResetPercent) > 0.5,
        'Reset color scopes width',
        'Reset Color Scopes Width',
      )}
    </InteractionLockRegion>
    <InteractionLockRegion
      locked={isMaskEditingActive.current}
      class="h-full"
      overlayClass="rounded-none"
      style="width: {displayedScopesSplitPercent}%"
    >
      <div class="flex h-full flex-col min-w-0">
        {#await importColorScopesMonitor() then { default: ColorScopesMonitor }}
          <ColorScopesMonitor onClose={handleCloseColorScopes} />
        {/await}
      </div>
    </InteractionLockRegion>
  {/if}
</div>
