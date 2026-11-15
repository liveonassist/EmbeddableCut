<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { EditorWorkspaceId } from '@/config/editor-workspaces'
  import { importExportDialog } from '@/features/editor/deps/export-contract'
  import { importBundleExportDialog } from '@/features/editor/deps/project-bundle'

  function workspaceTimelineSizeStorageKey(workspace: EditorWorkspaceId): string {
    return `editor:workspaceTimelineSize:${workspace}`
  }

  function loadWorkspaceTimelineSize(workspace: EditorWorkspaceId): number | null {
    try {
      const raw = localStorage.getItem(workspaceTimelineSizeStorageKey(workspace))
      if (raw === null) return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  function saveWorkspaceTimelineSize(workspace: EditorWorkspaceId, size: number): void {
    try {
      localStorage.setItem(workspaceTimelineSizeStorageKey(workspace), String(size))
    } catch {
      /* noop */
    }
  }

  function preloadExportDialog() {
    return importExportDialog()
  }

  function preloadBundleExportDialog() {
    return importBundleExportDialog()
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { Pane } from 'paneforge'
  import { toast } from 'svelte-sonner'
  import { EditorError } from '@embeddablecut/sdk'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { createLogger } from '@/shared/logging/logger'
  import { i18n } from '@/i18n'
  import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
  import ErrorBoundary from '@/components/error-boundary.svelte'
  import Contribution from '@/components/contribution.svelte'
  import type { PanelContribution, ReplaceableSlot } from '../../../../extensions/contributions'
  import ContributionIcon from '@/components/contribution-icon.svelte'
  import Toolbar from '../toolbar.svelte'
  import MediaSidebar from '../media-sidebar.svelte'
  import PropertiesSidebar from '../properties-sidebar/index.svelte'
  import Feature from '@/components/feature.svelte'
  import PreviewArea from '../preview-area.svelte'
  import { MotionPreviewArea, MotionTimelineDock } from '../compose-workspace/compose-layout'
  import InteractionLockRegion from '../interaction-lock-region.svelte'
  import AudioMeterPanel from '../audio-meter-panel.svelte'
  import EditorDialogHost from './editor-dialog-host.svelte'
  import TimelineDialogHost from './timeline-dialog-host.svelte'
  import { importTimeline } from '@/features/editor/deps/timeline-ui'
  import { useEditorHotkeys } from '@/features/editor/hooks/use-editor-hotkeys.svelte'
  import { useAutoSave } from '../../hooks/use-auto-save.svelte'
  import {
    useTimelineShortcuts,
    useTransitionBreakageNotifications,
  } from '@/features/editor/deps/timeline-hooks'
  import { initTransitionChainSubscription } from '@/features/editor/deps/timeline-subscriptions'
  import { toggleSnap, useTimelineSettingsStore } from '@/features/editor/deps/timeline-store'
  import { useSettingsStore } from '@/features/editor/deps/settings'
  import { useMaskEditorStore } from '@/features/editor/deps/preview'
  import { usePlaybackStore } from '@/shared/state/playback'
  import { useEditorStore } from '@/shared/state/editor'
  import { clearPreviewAudioCache } from '@/features/editor/deps/composition-runtime'
  import {
    importExportsDialog,
    RenderQueuePersistence,
    RenderQueueRunner,
    useRenderQueueStore,
  } from '@/features/editor/deps/export-contract'
  import { getEditorLayout, getEditorLayoutCssVars } from '@/config/editor-layout'
  import { EDITOR_WORKSPACE_TIMELINE_SIZE } from '@/config/editor-workspaces'
  import { IoDragReadout } from '@/shared/timeline/io-range'
  import { maybeEditorUi } from '../../editor-ui'
  import type { EditorProject } from './types'

  const logger = createLogger('Editor')

  /** Project metadata of the open project; its timeline is already in the stores. */
  interface LoadedEditorProps {
    projectId: string
    project: EditorProject
  }

  let { projectId, project }: LoadedEditorProps = $props()

  const editorUi = maybeEditorUi()
  const contributions = editorUi?.contributions ?? null

  let exportDialogOpen = $state(false)
  let bundleExportDialogOpen = $state(false)
  let renderQueueOpen = $state(false)
  const renderQueueActiveCount = select(
    useRenderQueueStore,
    (s) => s.jobs.filter((j) => j.status === 'queued' || j.status === 'rendering').length,
  )
  let bundleFileHandle = $state.raw<FileSystemFileHandle | undefined>()
  const editorDensity = select(useSettingsStore, (s) => s.editorDensity)
  const snapEnabledPreference = select(useSettingsStore, (s) => s.snapEnabled)
  const editorLayout = $derived(getEditorLayout(editorDensity.current))
  const editorLayoutCssVars = $derived(
    Object.entries(getEditorLayoutCssVars(editorLayout))
      .map(([name, value]) => `${name}: ${value}`)
      .join('; '),
  )
  const propertiesFullColumn = select(useEditorStore, (s) => s.propertiesFullColumn)
  const mediaFullColumn = select(useEditorStore, (s) => s.mediaFullColumn)
  const workspace = select(useEditorStore, (s) => s.workspace)
  const isMaskEditingActive = select(useMaskEditorStore, (s) => s.isEditing)
  const isDirty = select(useTimelineSettingsStore, (s) => s.isDirty)
  let timelinePanel: Pane | undefined = $state()
  let previousWorkspace = useEditorStore.getState().workspace

  // Guard against concurrent saves (e.g., spamming Ctrl+S)
  let isSaving = false

  const replacement = (slot: ReplaceableSlot) => contributions?.replacement(slot) ?? null
  const bottomPanels = $derived(contributions?.panels('bottom') ?? [])
  const inspectorPanels = $derived(contributions?.panels('inspector') ?? [])

  // Initialize transition chain subscription (pre-computes chains from timeline data)
  // This subscription recomputes chains when items/transitions change - deferred to idle
  // time so it doesn't compete with the initial editor render.
  $effect(() => {
    let unsubscribe: (() => void) | undefined
    const id = requestIdleCallback(() => {
      unsubscribe = initTransitionChainSubscription()
    })
    return () => {
      cancelIdleCallback(id)
      unsubscribe?.()
    }
  })

  // Preload export dialogs during idle time so they open instantly.
  $effect(() => {
    const id = requestIdleCallback(() => {
      // Best-effort idle preloads: swallow rejections (offline chunk load, or
      // the dynamic import racing test-environment teardown).
      void preloadExportDialog().catch(() => {})
      void preloadBundleExportDialog().catch(() => {})
    })
    return () => cancelIdleCallback(id)
  })

  // Prewarm effect preview thumbnails during idle time without making the
  // effects feature part of the initial editor chunk.
  $effect(() => {
    const id = requestIdleCallback(() => {
      void import('@/features/editor/deps/effects-contract')
        .then((module) => module.prewarmEffectPreviews())
        .catch(() => {})
    })
    return () => cancelIdleCallback(id)
  })

  // Clear stale scrub preview from previous editor sessions, and stop
  // playback when leaving the editor. A non-null previewFrame puts preview
  // into "scrubbing" mode, which can defer media URL resolution during
  // project open. The project itself stays open: the SDK owns it.
  $effect(() => {
    void projectId
    usePlaybackStore.getState().setPreviewFrame(null)
    return () => {
      const playbackStore = usePlaybackStore.getState()
      playbackStore.setPreviewFrame(null)
      playbackStore.pause()
      clearPreviewAudioCache()
    }
  })

  $effect(() => {
    useEditorStore.getState().syncSidebarLayout(editorLayout)
  })

  // Apply the per-workspace timeline split when switching workspaces:
  // snapshot the outgoing workspace's split, then restore the incoming
  // workspace's saved split (or its preset default on first visit).
  $effect(() => {
    const nextWorkspace = workspace.current
    const layout = editorLayout
    if (previousWorkspace === nextWorkspace) return
    const outgoing = previousWorkspace
    previousWorkspace = nextWorkspace

    // Workspace switches should not carry transient scrub/hover preview
    // frames across surfaces. Color scopes intentionally skip previewFrame
    // samples, so a stale Edit preview frame can make them appear frozen.
    usePlaybackStore.getState().setPreviewFrame(null)

    // The timeline pane is unmounted in Color; it remounts on the next tick.
    const pane = timelinePanel
    if (!pane) return

    saveWorkspaceTimelineSize(outgoing, pane.getSize())

    const targetSize =
      loadWorkspaceTimelineSize(nextWorkspace) ??
      EDITOR_WORKSPACE_TIMELINE_SIZE[nextWorkspace] ??
      layout.timelineDefaultSize
    pane.resize(Math.min(layout.timelineMaxSize, Math.max(layout.timelineMinSize, targetSize)))
  })

  $effect(() => {
    const preference = snapEnabledPreference.current
    const { snapEnabled } = useTimelineSettingsStore.getState()
    if (snapEnabled !== preference) {
      toggleSnap()
    }
  })

  $effect(() => {
    if (!isMaskEditingActive.current) return
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) {
      activeElement.blur()
    }
  })

  // Save the project through the SDK (with guard against concurrent saves).
  async function handleSave(): Promise<void> {
    if (isSaving) {
      return
    }

    isSaving = true

    try {
      await editorUi?.editor.save()
      logger.debug('Project saved successfully')
      toast.success(i18n.t('editor.editor.projectSaved'))
    } catch (error) {
      // A project loaded from a document has no workspace to save to: the
      // host keeps it, through `toDocument()`.
      if (error instanceof EditorError && error.code === 'NO_PROJECT') return
      logger.error('Failed to save project:', error)
      toast.error(i18n.t('editor.editor.projectSaveFailed'))
      throw error // Re-throw so callers know save failed
    } finally {
      isSaving = false
    }
  }

  function handleExport() {
    // Pause playback when opening export dialog
    usePlaybackStore.getState().pause()
    void preloadExportDialog()
    exportDialogOpen = true
  }

  function handleOpenRenderQueue() {
    void importExportsDialog()
    renderQueueOpen = true
  }

  async function handleExportBundle() {
    void preloadBundleExportDialog()

    // Show native save picker BEFORE opening the modal dialog to avoid
    // focus-loss conflicts between the native picker and the dialog.
    if (typeof window.showSaveFilePicker === 'function') {
      const safeName = project.name
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .substring(0, 100)
      try {
        bundleFileHandle = await window.showSaveFilePicker({
          suggestedName: `${safeName}.freecut.zip`,
          types: [
            {
              description: i18n.t('editor.editor.projectBundle'),
              accept: { 'application/zip': ['.freecut.zip'] },
            },
          ],
        })
      } catch {
        // User cancelled the picker - don't open the dialog
        return
      }
    } else {
      bundleFileHandle = undefined
    }

    bundleExportDialogOpen = true
  }

  // Enable keyboard shortcuts
  useEditorHotkeys(() => ({
    onSave: () => void handleSave().catch(() => {}),
    onExport: handleExport,
  }))
  useTimelineShortcuts()
  useAutoSave(() => ({ isDirty: isDirty.current, onSave: handleSave }))

  // Enable transition breakage notifications
  useTransitionBreakageNotifications()

  const timelineDuration = 30
  const isColorWorkspace = $derived(workspace.current === 'color')
  const isMotionWorkspace = $derived(workspace.current === 'motion')
  // Color replaces the default editor shell. Motion deliberately keeps it and
  // swaps the preview/timeline surfaces while retaining the shared sidebars.
  const hidesDefaultSidebars = $derived(isColorWorkspace)

  // Loaded on first use; a loader in the script lets static analysis see the import.
  const loadColorTimelineNavigator = () => import('../color-timeline-navigator.svelte')
  const loadColorGradingDock = () => import('../color-grading-dock.svelte')
</script>

{#snippet slot(name: ReplaceableSlot, fallback: Snippet)}
  {@const piece = replacement(name)}
  {#if piece && editorUi}
    <Contribution
      content={piece}
      context={{ editor: editorUi.editor }}
      class="flex min-h-0 min-w-0"
    />
  {:else}
    {@render fallback()}
  {/if}
{/snippet}

{#snippet mediaSidebar()}
  <InteractionLockRegion locked={isMaskEditingActive.current}>
    <ErrorBoundary level="feature">
      {@render slot('media-sidebar', mediaSidebarDefault)}
    </ErrorBoundary>
  </InteractionLockRegion>
{/snippet}

{#snippet mediaSidebarDefault()}
  <Feature id="sidebar"><MediaSidebar /></Feature>
{/snippet}

{#snippet propertiesSidebar()}
  <InteractionLockRegion locked={isMaskEditingActive.current}>
    <ErrorBoundary level="feature">
      {@render slot('properties-sidebar', propertiesSidebarDefault)}
    </ErrorBoundary>
  </InteractionLockRegion>
  <!-- Host inspector panels stack in a column beside the properties sidebar. -->
  {#if inspectorPanels.length > 0}
    <InteractionLockRegion locked={isMaskEditingActive.current}>
      <aside class="flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-border bg-background">
        {#each inspectorPanels as panel (panel.id)}
          <section
            class="flex min-h-0 flex-1 flex-col border-b border-border last:border-b-0"
            aria-label={panel.title}
            data-panel-id={panel.id}
          >
            {@render contributedPanel(panel)}
          </section>
        {/each}
      </aside>
    </InteractionLockRegion>
  {/if}
{/snippet}

{#snippet contributedPanel(panel: PanelContribution)}
  {#if editorUi}
    <div class="panel-header flex h-8 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-medium">
      {#if panel.icon}<ContributionIcon icon={panel.icon} class="h-3.5 w-3.5 text-muted-foreground" />{/if}
      <span class="truncate">{panel.title}</span>
    </div>
    <ErrorBoundary level="component">
      <Contribution
        content={panel.content}
        context={{ editor: editorUi.editor }}
        class="min-h-0 flex-1 overflow-auto"
      />
    </ErrorBoundary>
  {/if}
{/snippet}

{#snippet propertiesSidebarDefault()}
  <Feature id="inspector"><PropertiesSidebar /></Feature>
{/snippet}

{#snippet toolbarDefault()}
  <Toolbar
    {projectId}
    {project}
    onSave={handleSave}
    onExport={handleExport}
    onExportBundle={handleExportBundle}
    onOpenRenderQueue={handleOpenRenderQueue}
    renderQueueCount={renderQueueActiveCount.current}
  />
{/snippet}

{#snippet previewDefault()}
  <PreviewArea {project} />
{/snippet}

{#snippet timelineDefault()}
  {#await importTimeline() then { default: Timeline }}
    <Timeline duration={timelineDuration} />
  {/await}
{/snippet}

<div
  class="h-full bg-background flex flex-col overflow-hidden"
  style={editorLayoutCssVars}
  role="application"
  aria-label={t('editor.editor.appLabel')}
>
  <!-- Top Toolbar -->
  <InteractionLockRegion locked={isMaskEditingActive.current}>
    {@render slot('toolbar', toolbarDefault)}
  </InteractionLockRegion>

  <!-- Main Layout: Full-height sidebar + vertical split -->
  <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar - Media Library (full column mode) -->
    {#if mediaFullColumn.current && !hidesDefaultSidebars}
      {@render mediaSidebar()}
    {/if}


    <!-- Right side: Preview/Properties + Timeline -->
    {#if isColorWorkspace}
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary level="feature">
            {@render slot('preview', previewDefault)}
          </ErrorBoundary>
        </div>
        {#await loadColorTimelineNavigator() then { default: ColorTimelineNavigator }}
          <ColorTimelineNavigator />
        {/await}
        <InteractionLockRegion
          locked={isMaskEditingActive.current}
          class="h-[37%] min-h-[288px] max-h-[39vh] shrink-0"
        >
          <ErrorBoundary level="feature">
            {#await loadColorGradingDock() then { default: ColorGradingDock }}
              <ColorGradingDock />
            {/await}
          </ErrorBoundary>
        </InteractionLockRegion>
      </div>
    {:else}
      <ResizablePanelGroup direction="vertical" class="flex-1 min-w-0" autoSaveId="editor:timeline-layout">
        <!-- Top - Preview + Properties (inline mode) -->
        <ResizablePanel
          defaultSize={100 - editorLayout.timelineDefaultSize}
          minSize={100 - editorLayout.timelineMaxSize}
          maxSize={100 - editorLayout.timelineMinSize}
        >
          <div class="h-full flex overflow-hidden relative">
            <!-- Left Sidebar - Media Library (inline with preview) -->
            {#if !mediaFullColumn.current}
              {@render mediaSidebar()}
            {/if}

            <!-- Center - Preview -->
            <ErrorBoundary level="feature">
              {#if isMotionWorkspace}
                <MotionPreviewArea {project} />
              {:else}
                {@render slot('preview', previewDefault)}
              {/if}
            </ErrorBoundary>

            <!-- Right Sidebar - Properties (inline with preview) -->
            {#if !propertiesFullColumn.current}
              {@render propertiesSidebar()}
            {/if}
          </div>
        </ResizablePanel>

        <ResizableHandle
          withHandle
          class={isMaskEditingActive.current ? 'pointer-events-none opacity-60' : undefined}
        />

        <!-- Bottom - Timeline -->
        <ResizablePanel
          bind:this={timelinePanel}
          defaultSize={editorLayout.timelineDefaultSize}
          minSize={editorLayout.timelineMinSize}
          maxSize={editorLayout.timelineMaxSize}
        >
          <InteractionLockRegion locked={isMaskEditingActive.current} class="h-full">
            <ErrorBoundary level="feature">
              <div class="h-full flex overflow-hidden">
                <div class="min-w-0 flex-1">
                  {#if isMotionWorkspace}
                    <MotionTimelineDock {project} />
                  {:else}
                    {@render slot('timeline', timelineDefault)}
                  {/if}
                </div>
                {#each bottomPanels as panel (panel.id)}
                  <section
                    class="flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-border"
                    aria-label={panel.title}
                    data-panel-id={panel.id}
                  >
                    {@render contributedPanel(panel)}
                  </section>
                {/each}
                <AudioMeterPanel />
              </div>
            </ErrorBoundary>
          </InteractionLockRegion>
        </ResizablePanel>
      </ResizablePanelGroup>
    {/if}

    <!-- Right Sidebar - Properties (full column mode) -->
    {#if propertiesFullColumn.current && !hidesDefaultSidebars}
      {@render propertiesSidebar()}
    {/if}
  </div>

  <!-- Export Dialog -->
  {#if exportDialogOpen}
    {#await importExportDialog() then { default: ExportDialog }}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => (exportDialogOpen = false)}
        onOpenRenderQueue={handleOpenRenderQueue}
      />
    {/await}
  {/if}

  <!-- Exports + render queue dialog -->
  {#if renderQueueOpen}
    {#await importExportsDialog() then { ExportsDialog }}
      <ExportsDialog open={renderQueueOpen} onClose={() => (renderQueueOpen = false)} {projectId} />
    {/await}
  {/if}

  <!-- Bundle Export Dialog -->
  {#if bundleExportDialogOpen}
    {#await importBundleExportDialog() then { default: BundleExportDialog }}
      <BundleExportDialog
        open={bundleExportDialogOpen}
        onClose={() => {
          bundleExportDialogOpen = false
          bundleFileHandle = undefined
        }}
        {projectId}
        onBeforeExport={handleSave}
        fileHandle={bundleFileHandle}
      />
    {/await}
  {/if}

  <!-- Restores/persists the per-project queue, and drains it serially. -->
  <RenderQueuePersistence {projectId} />
  <RenderQueueRunner />

  <EditorDialogHost {projectId} />
  <TimelineDialogHost />

  <!-- Single global cursor-readout for IO (in/out) drags across all surfaces. -->
  <IoDragReadout />
</div>
