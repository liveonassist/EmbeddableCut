<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { i18n } from '@/i18n'
  import type { TimelineItem } from '@/types/timeline'

  /** One shared import per lazily loaded panel, so a re-render reuses the resolved module. */
  function lazy<T>(load: () => Promise<T>): () => Promise<T> {
    let promise: Promise<T> | null = null
    return () => (promise ??= load())
  }

  const loadClipPropertiesPanel = lazy(() => import('./clip-panel/index.svelte'))
  const loadMarkerPanel = lazy(() => import('./marker-panel/index.svelte'))
  const loadTransitionPanel = lazy(() => import('./transition-panel/index.svelte'))

  type HeaderItem = Pick<TimelineItem, 'id' | 'label' | 'linkedGroupId' | 'type'>

  // Selection headers are derived per items-store update. A module cache keyed on
  // the selection contents returns the same array identity while the selected
  // items' header fields are unchanged, so unrelated item edits don't re-render
  // the sidebar header (previously done by stringifying/parsing a JSON signature).
  let selectedItemHeadersCache: { ids: string[]; headers: HeaderItem[] } | null = null

  function areIdListsEqual(previous: readonly string[], next: readonly string[]): boolean {
    if (previous.length !== next.length) return false
    for (let index = 0; index < previous.length; index += 1) {
      if (previous[index] !== next[index]) return false
    }
    return true
  }

  function areHeaderFieldsCurrent(
    headers: readonly HeaderItem[],
    itemById: Record<string, TimelineItem>,
  ): boolean {
    for (const header of headers) {
      const item = itemById[header.id]
      if (!item) return false
      if (
        item.label !== header.label ||
        item.linkedGroupId !== header.linkedGroupId ||
        item.type !== header.type
      ) {
        return false
      }
    }
    return true
  }

  function selectSelectedItemHeaders(
    state: { itemById: Record<string, TimelineItem> },
    selectedItemIds: readonly string[],
  ): HeaderItem[] {
    const cached = selectedItemHeadersCache
    if (
      cached &&
      areIdListsEqual(cached.ids, selectedItemIds) &&
      areHeaderFieldsCurrent(cached.headers, state.itemById)
    ) {
      return cached.headers
    }

    const headers: HeaderItem[] = []
    for (const itemId of selectedItemIds) {
      const item = state.itemById[itemId]
      if (item) {
        headers.push({
          id: item.id,
          label: item.label,
          linkedGroupId: item.linkedGroupId,
          type: item.type,
        })
      }
    }
    selectedItemHeadersCache = { ids: [...selectedItemIds], headers }
    return headers
  }

  function buildClipHeaderGroups(items: HeaderItem[]) {
    const groups = new Map<
      string,
      { displayLabel: string | null; labels: string[]; audioOnly: boolean }
    >()

    for (const item of items) {
      const key = item.linkedGroupId ?? item.id
      const label = item.label.trim() || null
      const existing = groups.get(key)

      if (!existing) {
        groups.set(key, {
          displayLabel: label,
          labels: label ? [label] : [],
          audioOnly: item.type === 'audio',
        })
        continue
      }

      if (label) {
        existing.labels.push(label)
        if (!existing.displayLabel || (existing.audioOnly && item.type !== 'audio')) {
          existing.displayLabel = label
        }
      }

      if (item.type !== 'audio') {
        existing.audioOnly = false
      }
    }

    return Array.from(groups.values(), (group) => ({
      displayLabel: group.displayLabel,
      title: group.labels
        .filter((label, index, labels) => labels.indexOf(label) === index)
        .join(', '),
    }))
  }

  function getClipHeader(items: HeaderItem[]) {
    const groups = buildClipHeaderGroups(items)
    const logicalCount = groups.length

    if (logicalCount === 0) return null

    if (logicalCount === 1 && groups[0]?.displayLabel) {
      return {
        text: groups[0].displayLabel,
        title: groups[0].title || groups[0].displayLabel,
      }
    }

    const fallbackLabel = i18n.t('editor.propertiesSidebar.clipsSelected', { count: logicalCount })

    return {
      text: fallbackLabel,
      title:
        groups
          .map((group) => group.title || group.displayLabel)
          .filter(Boolean)
          .join(', ') || fallbackLabel,
    }
  }

  const prefersReducedMotionQuery = '(prefers-reduced-motion: reduce)'
</script>

<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import { select } from '$lib/store.svelte'
  import { portalTarget } from '$lib/context'
  import { Button } from '@/components/ui/button'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import {
    useCompositionNavigationStore,
    useCompositionsStore,
    useItemsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useEditorStore } from '@/shared/state/editor'
  import { useSelectionStore } from '@/shared/state/selection'
  import CanvasPanel from './canvas-panel/index.svelte'
  import Feature from '@/components/feature.svelte'
  import { useSettingsStore } from '@/features/editor/deps/settings'
  import {
    EDITOR_LAYOUT_CSS_VALUES,
    clampRightEditorSidebarWidth,
    getEditorLayout,
  } from '@/config/editor-layout'

  /**
   * Properties sidebar - right panel for editing properties.
   * Shows TransitionPanel when a transition is selected, MarkerPanel when a marker
   * is selected, ClipPanel when clips are selected, CanvasPanel otherwise.
   */
  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  // Use granular selectors - Zustand v5 best practice
  const rightSidebarOpen = select(useEditorStore, (s) => s.rightSidebarOpen)
  const rightSidebarWidth = select(useEditorStore, (s) => s.rightSidebarWidth)
  const propertiesFullColumn = select(useEditorStore, (s) => s.propertiesFullColumn)
  const workspace = select(useEditorStore, (s) => s.workspace)
  const clipInspectorTab = select(useEditorStore, (s) => s.clipInspectorTab)
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const selectedMarkerId = select(useSelectionStore, (s) => s.selectedMarkerId)
  const selectedTransitionId = select(useSelectionStore, (s) => s.selectedTransitionId)
  const activeCompositionId = select(useCompositionNavigationStore, (s) => s.activeCompositionId)
  const activeCompositionName = $derived(
    select(useCompositionsStore, (s) =>
      activeCompositionId.current ? s.compositionById[activeCompositionId.current]?.name : undefined,
    ),
  )
  const selectedItems = $derived(
    select(useItemsStore, (state) => selectSelectedItemHeaders(state, selectedItemIds.current)),
  )

  let prefersReducedMotion = $state(false)
  $effect(() => {
    const query = window.matchMedia(prefersReducedMotionQuery)
    prefersReducedMotion = query.matches
    const handleChange = () => (prefersReducedMotion = query.matches)
    query.addEventListener('change', handleChange)
    return () => query.removeEventListener('change', handleChange)
  })

  const hasClipSelection = $derived(selectedItemIds.current.length > 0)
  const clipHeader = $derived(getClipHeader(selectedItems.current))
  const activeClipHeader = $derived(
    !selectedTransitionId.current && !selectedMarkerId.current ? clipHeader : null,
  )
  const motionCompositionHeader = $derived(
    workspace.current === 'motion' &&
      !hasClipSelection &&
      !selectedTransitionId.current &&
      !selectedMarkerId.current &&
      activeCompositionName.current
      ? activeCompositionName.current
      : null,
  )
  const headerLabel = $derived(
    workspace.current === 'motion' && activeClipHeader
      ? t('editor.propertiesSidebar.layer', { defaultValue: 'Layer' })
      : motionCompositionHeader
        ? t('editor.propertiesSidebar.composition', { defaultValue: 'Composition' })
        : t('editor.propertiesSidebar.title'),
  )
  const headerContext = $derived(activeClipHeader?.text ?? motionCompositionHeader)
  const headerTitle = $derived(activeClipHeader?.title ?? motionCompositionHeader ?? undefined)

  // Keep the panel content mounted + visible while the collapse animation plays
  // so it slides out smoothly instead of blinking away. Only drop the content
  // (the perf win) once the close animation has actually settled.
  let contentVisible = $state(useEditorStore.getState().rightSidebarOpen)
  $effect.pre(() => {
    if (rightSidebarOpen.current) contentVisible = true
  })

  const handleWidthTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'width') return
    if (!rightSidebarOpen.current) contentVisible = false
  }

  // Resize handle logic
  let isResizing = $state(false)
  let startX = 0
  let startWidth = 0

  // Cursors go on the body and on the editor's own root: a shadow root sees only the latter.
  const editorRoot = portalTarget()
  const cursorTargets = editorRoot === document.body ? [document.body] : [document.body, editorRoot]
  const setGlobalDragStyles = (cursor: string, userSelect: string) => {
    for (const target of cursorTargets) {
      target.style.cursor = cursor
      target.style.userSelect = userSelect
    }
  }

  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault()
    isResizing = true
    startX = e.clientX
    startWidth = useEditorStore.getState().rightSidebarWidth
    setGlobalDragStyles('col-resize', 'none')
  }

  $effect(() => {
    const layout = editorLayout
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      // Dragging left increases width for right sidebar
      const delta = startX - e.clientX
      const newWidth = clampRightEditorSidebarWidth(startWidth + delta, layout)
      useEditorStore.getState().setRightSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      if (!isResizing) return
      isResizing = false
      setGlobalDragStyles('', '')
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      isResizing = false
      setGlobalDragStyles('', '')
    }
  })

  // Width animates for the open/close toggle. We intentionally animate `width`
  // (a layout property, not the cheaper transform/opacity) because collapsing
  // must reclaim layout space for the preview — transform can't do that.
  // overflow-hidden clips the fixed-width inner content while the panel closes.
  // Close is a touch faster than open (exit < entrance). During a resize-drag
  // we snap (duration 0) so width tracks the pointer instead of easing behind it.
  const widthTransition = $derived(
    isResizing || prefersReducedMotion
      ? 'none'
      : `width ${rightSidebarOpen.current ? 260 : 200}ms cubic-bezier(0.32, 0.72, 0, 1)`,
  )
  const toggleRightSidebar = () => useEditorStore.getState().toggleRightSidebar()
  const togglePropertiesFullColumn = () => useEditorStore.getState().togglePropertiesFullColumn()
</script>

<!-- Right Sidebar -->
<div
  class="panel-bg border-l border-border shrink-0 relative h-full overflow-hidden"
  style:width="{rightSidebarOpen.current ? rightSidebarWidth.current : 0}px"
  style:transition={widthTransition}
  ontransitionend={handleWidthTransitionEnd}
>
  {#if contentVisible}
    <div class="h-full flex flex-col" style:width="{rightSidebarWidth.current}px">
      <!-- Sidebar Header -->
      <div
        class="flex items-center justify-between px-3 border-b border-border flex-shrink-0"
        style:height={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderHeight}
      >
        <div class="min-w-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            class="shrink-0"
            style="width: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}; height: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}"
            onclick={togglePropertiesFullColumn}
            aria-label={propertiesFullColumn.current
              ? t('editor.propertiesSidebar.dockToPreview')
              : t('editor.propertiesSidebar.expandFullColumn')}
            data-tooltip={propertiesFullColumn.current
              ? t('editor.propertiesSidebar.dockToPreview')
              : t('editor.propertiesSidebar.expandFullColumn')}
            data-tooltip-side="bottom"
          >
            {#if propertiesFullColumn.current}
              <ChevronUp class="w-3 h-3" />
            {:else}
              <ChevronDown class="w-3 h-3" />
            {/if}
          </Button>
          <Settings2 class="w-3 h-3 shrink-0 text-muted-foreground" />
          <h2 class="min-w-0 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span class="shrink-0 uppercase tracking-wide">{headerLabel}</span
            >{#if headerContext}<span class="shrink-0">-</span><span
                class="truncate normal-case tracking-normal"
                title={headerTitle}>{headerContext}</span
              >{/if}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          style="width: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}; height: {EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}"
          onclick={toggleRightSidebar}
          aria-label={t('editor.mediaSidebar.collapsePanel')}
          data-tooltip={t('editor.mediaSidebar.collapsePanel')}
        >
          <ChevronRight class="w-3.5 h-3.5" />
        </Button>
      </div>

      <!-- Properties Panel -->
      <div
        class={workspace.current === 'motion' &&
        clipInspectorTab.current === 'motion' &&
        hasClipSelection
          ? 'min-h-0 flex-1 overflow-hidden p-3'
          : 'flex-1 overflow-y-auto overflow-x-hidden p-3 [scrollbar-gutter:stable]'}
      >
        {#if selectedTransitionId.current}
          {#await loadTransitionPanel() then { default: TransitionPanel }}
            <TransitionPanel />
          {/await}
        {:else if selectedMarkerId.current}
          {#await loadMarkerPanel() then { default: MarkerPanel }}
            <MarkerPanel />
          {/await}
        {:else}
          <!-- Mount the lazy inspector before the first selection. Once its
               chunk resolves it stays subscribed while hidden, so a selection
               made during playback renders straight away. -->
          <div
            data-testid="properties-clip-panel-host"
            hidden={!hasClipSelection}
            class={workspace.current === 'motion' && clipInspectorTab.current === 'motion'
              ? 'h-full min-h-0'
              : undefined}
          >
            {#await loadClipPropertiesPanel()}
              <div class="space-y-3 animate-pulse" aria-hidden="true" data-testid="properties-loading">
                <div class="h-8 rounded bg-muted/60"></div>
                <div class="h-24 rounded bg-muted/40"></div>
                <div class="h-16 rounded bg-muted/30"></div>
              </div>
            {:then { default: ClipPanel }}
              <ClipPanel />
            {/await}
          </div>
          {#if !hasClipSelection}
            <Feature id="inspector.canvas">
            <div>
              <CanvasPanel />
            </div>
            </Feature>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
  <!-- Resize Handle -->
  {#if rightSidebarOpen.current}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onmousedown={handleResizeStart}
      class="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary/50 transition-colors z-10"
    ></div>
  {/if}
</div>

<!-- Right Sidebar reveal toggle — matched to the in-header collapse button's
     size, chevron, and top alignment so the arrow stays in the same place
     and size when toggling (mirrors the always-present arrow on the left
     sidebar rail). Edge-attached rounded tab keeps it discoverable. -->
{#if !rightSidebarOpen.current}
  <button
    onclick={toggleRightSidebar}
    class="absolute right-0 top-2 z-10 flex items-center justify-center rounded-l-md border border-r-0 border-border bg-secondary/50 hover:bg-secondary transition-colors"
    style:width={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}
    style:height={EDITOR_LAYOUT_CSS_VALUES.sidebarHeaderButtonSize}
    data-tooltip={t('editor.propertiesSidebar.showPanel')}
    data-tooltip-side="left"
    aria-label={t('editor.propertiesSidebar.showPanel')}
  >
    <ChevronLeft class="w-3.5 h-3.5 text-muted-foreground" />
  </button>
{/if}
