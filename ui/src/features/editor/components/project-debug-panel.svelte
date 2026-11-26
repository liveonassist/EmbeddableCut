<!-- SPDX-License-Identifier: MIT -->
<!--
  Project Debug Panel

  Project data operations UI rendered inside the toolbar popover.
  Visibility is controlled by the parent debug popover.
-->
<script lang="ts" module>
  import type LucideIcon from '@lucide/svelte/icons/bug'

  interface DebugAction {
    label: string
    icon: typeof LucideIcon
    action: () => Promise<void>
    description: string
  }

  /** The parts of the app's `window.__DEBUG__` API (FreeCut's `app/debug/project-debug.ts`) the panel calls. */
  interface DebugApi {
    getProjectMedia(projectId: string): Promise<string[]>
    getTracks(): Promise<unknown>
    getTransitions(): Promise<unknown>
    overlaps(): Promise<{ clean: boolean; count: number }>
    getPlaybackState(): Promise<unknown>
    previewPerf(): unknown
    jitter(): unknown
    getMediaLibrary(): Promise<unknown>
    getTransitionWindows(): Promise<unknown>
    cleanOrphans(options: { dryRun: boolean }): Promise<unknown>
  }

  function getDebugApi(): DebugApi {
    const api = (window as unknown as { __DEBUG__?: DebugApi }).__DEBUG__
    if (!api) {
      throw new Error('Debug API is not initialized')
    }
    return api
  }
</script>

<script lang="ts">
  import Bug from '@lucide/svelte/icons/bug'
  import Download from '@lucide/svelte/icons/download'
  import Upload from '@lucide/svelte/icons/upload'
  import Clipboard from '@lucide/svelte/icons/clipboard'
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste'
  import FileJson from '@lucide/svelte/icons/file-json'
  import Database from '@lucide/svelte/icons/database'
  import CheckCircle from '@lucide/svelte/icons/circle-check'
  import XCircle from '@lucide/svelte/icons/circle-x'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import FlaskConical from '@lucide/svelte/icons/flask-conical'
  import Play from '@lucide/svelte/icons/play'
  import Eye from '@lucide/svelte/icons/eye'
  import Activity from '@lucide/svelte/icons/activity'
  import Film from '@lucide/svelte/icons/film'
  import Layers from '@lucide/svelte/icons/layers'
  import { select } from '$lib/store.svelte'
  import { Button } from '@/components/ui/button'
  import { createLogger } from '@/shared/logging/logger'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
  import { cn } from '@/shared/ui/cn'
  import { useDebugStore } from '@/features/editor/stores/debug-store'
  import {
    importJsonExportService,
    importJsonImportService,
    importTestFixtures,
    type FixtureType,
  } from '@/features/editor/deps/project-bundle'
  import { createProject, getDBStats } from '@/infrastructure/storage'
  import { maybeEditorUi } from '../editor-ui'

  const logger = createLogger('DebugPanel')

  interface ProjectDebugPanelProps {
    projectId: string
  }

  let { projectId }: ProjectDebugPanelProps = $props()

  // FreeCut reloads into `/editor/<id>`; the embedded editor has no routes,
  // so it opens the new workspace project through the SDK instead.
  const editorUi = maybeEditorUi()
  const openProject = async (id: string) => {
    await editorUi?.editor.openProject(id)
  }

  let isExpanded = $state(true)
  let status = $state<{
    type: 'idle' | 'loading' | 'success' | 'error'
    message?: string
  }>({ type: 'idle' })
  let selectedFixture = $state<FixtureType>('multi-track')
  let availableFixtures = $state.raw<Array<{ type: FixtureType; name: string; description: string }>>(
    [],
  )

  // Debug overlay toggle
  const showVideoDebugOverlay = select(useDebugStore, (s) => s.showVideoDebugOverlay)
  const showPreviewPerfPanel = select(useDebugStore, (s) => s.showPreviewPerfPanel)

  // Load available fixtures on mount
  $effect(() => {
    if (import.meta.env.DEV) {
      void importTestFixtures().then(({ getAvailableFixtures }) => {
        availableFixtures = getAvailableFixtures()
      })
    }
  })

  const showStatus = (type: 'success' | 'error', message: string) => {
    status = { type, message }
    setTimeout(() => (status = { type: 'idle' }), 3000)
  }

  const runAction = async (fn: () => Promise<void>, successMsg: string) => {
    status = { type: 'loading' }
    try {
      await fn()
      showStatus('success', successMsg)
    } catch (error) {
      showStatus('error', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  async function handleExportJson() {
    const { downloadProjectJson } = await importJsonExportService()
    await downloadProjectJson(projectId)
  }

  async function handleCopyToClipboard() {
    const { copyProjectToClipboard } = await importJsonExportService()
    await copyProjectToClipboard(projectId)
  }

  async function handleImportFromClipboard() {
    const { importProjectFromClipboard } = await importJsonImportService()
    const result = await importProjectFromClipboard()
    await openProject(result.project.id)
  }

  async function handleImportFromFile() {
    const { showImportFilePicker } = await importJsonImportService()
    const result = await showImportFilePicker()
    if (result) {
      await openProject(result.project.id)
    }
  }

  async function handleLogSnapshot() {
    const api = getDebugApi()
    const { exportProjectJson, getSnapshotStats } = await importJsonExportService()
    const snapshot = await exportProjectJson(projectId)
    const stats = getSnapshotStats(snapshot)
    const mediaIds = await api.getProjectMedia(projectId)
    logger.debug('Project snapshot summary:', {
      project: {
        id: snapshot.project.id,
        name: snapshot.project.name,
        duration: snapshot.project.duration,
        metadata: snapshot.project.metadata,
        schemaVersion: snapshot.project.schemaVersion,
      },
      stats,
      mediaReferenceCount: snapshot.mediaReferences.length,
      associatedMediaCount: mediaIds.length,
    })
  }

  async function handleLogStorageStats() {
    const stats = await getDBStats()
    logger.debug('Workspace storage stats:', stats)
  }

  async function handleValidateProject() {
    const { exportProjectJson } = await importJsonExportService()
    const { validateSnapshotData } = await importJsonImportService()
    const snapshot = await exportProjectJson(projectId)
    const result = await validateSnapshotData(snapshot)
    logger.debug('Project snapshot validation:', {
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
    })
    if (!result.valid) {
      throw new Error(`${result.errors.length} validation error(s)`)
    }
  }

  async function handleLogTimelineState() {
    const api = getDebugApi()
    const [tracks, transitions, overlaps] = await Promise.all([
      api.getTracks(),
      api.getTransitions(),
      api.overlaps(),
    ])
    logger.debug('Live timeline state:', { tracks, transitions, overlaps })
  }

  async function handleLogPlaybackState() {
    const api = getDebugApi()
    logger.debug('Playback and preview state:', {
      playback: await api.getPlaybackState(),
      previewPerf: api.previewPerf(),
      jitter: api.jitter(),
    })
  }

  async function handleLogMediaLibrary() {
    const api = getDebugApi()
    logger.debug('Media library summary:', await api.getMediaLibrary())
  }

  async function handleLogTransitionWindows() {
    const api = getDebugApi()
    logger.debug('Transition windows:', await api.getTransitionWindows())
  }

  async function handleCheckOverlaps() {
    const api = getDebugApi()
    const overlaps = await api.overlaps()
    logger.debug('Timeline overlap check:', overlaps)
    if (!overlaps.clean) {
      throw new Error(`${overlaps.count} non-transition overlap(s)`)
    }
  }

  async function handleDryRunOrphanSweep() {
    const api = getDebugApi()
    logger.debug('Workspace orphan sweep dry run:', await api.cleanOrphans({ dryRun: true }))
  }

  async function handleGenerateFixture() {
    const { generateFixture } = await importTestFixtures()

    const { project } = generateFixture(selectedFixture)
    await createProject(project)

    // Open the new project
    await openProject(project.id)
  }

  async function handleDownloadFixture() {
    const { generateFixture } = await importTestFixtures()
    const { downloadSnapshotJson } = await importJsonExportService()

    const { snapshot } = generateFixture(selectedFixture)
    downloadSnapshotJson(snapshot, `fixture-${selectedFixture}`)
  }

  async function handleLogFixture() {
    const { generateFixture, getAvailableFixtures } = await importTestFixtures()

    const { project } = generateFixture(selectedFixture)
    const fixtureInfo = getAvailableFixtures().find((f) => f.type === selectedFixture)

    logger.debug('Fixture summary:', {
      fixture: selectedFixture,
      name: fixtureInfo?.name,
      tracks: project.timeline?.tracks.length ?? 0,
      items: project.timeline?.items.length ?? 0,
      transitions: project.timeline?.transitions?.length ?? 0,
      keyframes: project.timeline?.keyframes?.length ?? 0,
      markers: project.timeline?.markers?.length ?? 0,
    })
  }

  const exportActions: DebugAction[] = [
    {
      label: 'Download JSON',
      icon: Download,
      action: () => runAction(handleExportJson, 'Downloaded .embeddablecut.json'),
      description: 'Download project as JSON file',
    },
    {
      label: 'Copy to Clipboard',
      icon: Clipboard,
      action: () => runAction(handleCopyToClipboard, 'Copied to clipboard'),
      description: 'Copy project JSON to clipboard',
    },
  ]

  const importActions: DebugAction[] = [
    {
      label: 'Import from File',
      icon: Upload,
      action: () => runAction(handleImportFromFile, 'Imported successfully'),
      description: 'Import project from JSON file',
    },
    {
      label: 'Import from Clipboard',
      icon: ClipboardPaste,
      action: () => runAction(handleImportFromClipboard, 'Imported successfully'),
      description: 'Import project from clipboard',
    },
  ]

  const inspectActions: DebugAction[] = [
    {
      label: 'Project Summary',
      icon: FileJson,
      action: () => runAction(handleLogSnapshot, 'Logged to console'),
      description: 'Log project metadata, snapshot stats, and media counts',
    },
    {
      label: 'Live Timeline',
      icon: Layers,
      action: () => runAction(handleLogTimelineState, 'Logged to console'),
      description: 'Log current tracks, transitions, and overlap state',
    },
    {
      label: 'Playback State',
      icon: Activity,
      action: () => runAction(handleLogPlaybackState, 'Logged to console'),
      description: 'Log current playback, preview performance, and jitter state',
    },
    {
      label: 'Media Library',
      icon: Film,
      action: () => runAction(handleLogMediaLibrary, 'Logged to console'),
      description: 'Log current media library entries used by the editor',
    },
    {
      label: 'Transitions',
      icon: Layers,
      action: () => runAction(handleLogTransitionWindows, 'Logged to console'),
      description: 'Log resolved transition windows',
    },
    {
      label: 'Validate Schema',
      icon: CheckCircle,
      action: () => runAction(handleValidateProject, 'Snapshot schema valid'),
      description: 'Validate exported project snapshot against the current schema',
    },
    {
      label: 'Check Overlaps',
      icon: CheckCircle,
      action: () => runAction(handleCheckOverlaps, 'No overlaps found'),
      description: 'Detect non-transition timeline overlaps',
    },
  ]

  const storageActions: DebugAction[] = [
    {
      label: 'Storage Stats',
      icon: Database,
      action: () => runAction(handleLogStorageStats, 'Logged to console'),
      description: 'Log workspace project count and browser storage estimate',
    },
    {
      label: 'Dry Run Orphans',
      icon: Database,
      action: () => runAction(handleDryRunOrphanSweep, 'Logged to console'),
      description: 'Scan workspace mirror caches for orphaned media entries without deleting',
    },
  ]
</script>

{#snippet actionButton(action: DebugAction)}
  {@const Icon = action.icon}
  <Button
    variant="ghost"
    size="sm"
    class="w-full justify-start gap-2 h-8 text-xs"
    onclick={action.action}
    disabled={status.type === 'loading'}
    title={action.description}
  >
    <Icon class="h-3.5 w-3.5" />
    {action.label}
  </Button>
{/snippet}

{#snippet section(title: string, actions: DebugAction[])}
  <div>
    <div class="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
      {title}
    </div>
    <div class="space-y-0.5">
      {#each actions as action (action.label)}
        {@render actionButton(action)}
      {/each}
    </div>
  </div>
{/snippet}

<div class="text-sm">
  <!-- Header -->
  <div class="flex items-center gap-2 px-3 py-2 border-b border-zinc-700">
    <Bug class="h-4 w-4 text-amber-500" />
    <span class="font-medium">Debug Panel</span>
  </div>

  <!-- Status Bar -->
  {#if status.type !== 'idle'}
    <div
      class={cn(
        'px-3 py-1.5 text-xs flex items-center gap-2',
        status.type === 'loading' && 'bg-blue-500/20 text-blue-300',
        status.type === 'success' && 'bg-green-500/20 text-green-300',
        status.type === 'error' && 'bg-red-500/20 text-red-300',
      )}
    >
      {#if status.type === 'loading'}
        <div class="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
      {/if}
      {#if status.type === 'success'}<CheckCircle class="h-3 w-3" />{/if}
      {#if status.type === 'error'}<XCircle class="h-3 w-3" />{/if}
      <span class="truncate">{status.message || 'Processing...'}</span>
    </div>
  {/if}

  <!-- Content -->
  <Collapsible bind:open={isExpanded}>
    <CollapsibleTrigger>
      {#snippet child({ props })}
        <button
          {...props}
          class="w-full px-3 py-2 flex items-center justify-between hover:bg-zinc-800/50 text-xs text-zinc-400"
        >
          <span>Project: {projectId.slice(0, 8)}...</span>
          <ChevronDown class={cn('h-3.5 w-3.5 transition-transform', isExpanded && 'rotate-180')} />
        </button>
      {/snippet}
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="px-2 pb-2 space-y-3">
        <!-- Overlays Section -->
        <div>
          <div class="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
            Overlays
          </div>
          <div class="space-y-0.5">
            <Button
              variant="ghost"
              size="sm"
              class={cn(
                'w-full justify-start gap-2 h-8 text-xs',
                showVideoDebugOverlay.current && 'bg-amber-500/20 text-amber-300',
              )}
              onclick={() => useDebugStore.getState().toggleVideoDebugOverlay()}
              title="Show debug info on video clips"
            >
              <Eye class="h-3.5 w-3.5" />
              Video Debug Overlay
              {#if showVideoDebugOverlay.current}
                <span class="ml-auto text-[10px] bg-amber-500/30 px-1.5 py-0.5 rounded">ON</span>
              {/if}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class={cn(
                'w-full justify-start gap-2 h-8 text-xs',
                showPreviewPerfPanel.current && 'bg-amber-500/20 text-amber-300',
              )}
              onclick={() => useDebugStore.getState().togglePreviewPerfPanel()}
              title="Show preview performance diagnostics"
            >
              <Eye class="h-3.5 w-3.5" />
              Preview Perf Panel
              {#if showPreviewPerfPanel.current}
                <span class="ml-auto text-[10px] bg-amber-500/30 px-1.5 py-0.5 rounded">ON</span>
              {/if}
            </Button>
          </div>
        </div>

        <!-- Export Section -->
        {@render section('Export', exportActions)}

        <!-- Import Section -->
        {@render section('Import', importActions)}

        <!-- Inspect Section -->
        {@render section('Inspect Live State', inspectActions)}

        <!-- Storage Section -->
        {@render section('Storage', storageActions)}

        <!-- Fixtures Section -->
        <div>
          <div
            class="px-1 py-1 text-[10px] uppercase tracking-wider text-zinc-500 font-medium flex items-center gap-1"
          >
            <FlaskConical class="h-3 w-3" />
            Synthetic Fixtures
          </div>
          <div class="space-y-2 px-1">
            <Select
              value={selectedFixture}
              onValueChange={(value) => (selectedFixture = value as FixtureType)}
            >
              <SelectTrigger class="h-7 text-xs bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Select fixture..." />
              </SelectTrigger>
              <SelectContent class="bg-zinc-800 border-zinc-700">
                {#each availableFixtures as fixture (fixture.type)}
                  <SelectItem value={fixture.type} class="text-xs">
                    <div class="flex flex-col">
                      <span>{fixture.name}</span>
                      <span class="text-[10px] text-zinc-500">{fixture.description}</span>
                    </div>
                  </SelectItem>
                {/each}
              </SelectContent>
            </Select>
            <div class="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                class="flex-1 h-7 text-xs gap-1"
                onclick={() => runAction(handleGenerateFixture, 'Fixture created')}
                disabled={status.type === 'loading'}
                title="Create fixture project and open in editor"
              >
                <Play class="h-3 w-3" />
                Create
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="flex-1 h-7 text-xs gap-1"
                onclick={() => runAction(handleDownloadFixture, 'Downloaded')}
                disabled={status.type === 'loading'}
                title="Download fixture as JSON"
              >
                <Download class="h-3 w-3" />
                JSON
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 w-7 p-0"
                onclick={() => runAction(handleLogFixture, 'Logged')}
                disabled={status.type === 'loading'}
                title="Log fixture to console"
              >
                <FileJson class="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <!-- Console Hint -->
        <div class="px-1 pt-2 border-t border-zinc-800">
          <p class="text-[10px] text-zinc-500">
            Also available via <code class="bg-zinc-800 px-1 rounded">window.__DEBUG__</code>
          </p>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</div>
