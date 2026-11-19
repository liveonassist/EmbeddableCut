<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import { createLogger } from '@/shared/logging/logger'

  const logger = createLogger('ProjectsIndex')

  const PROJECTS_FOLDER_NAME = 'EmbeddableCutProjects'

  // Extract project name from bundle filename
  // Handles both "myproject.embeddablecut.zip" and browser-renamed "myproject.embeddablecut (1).zip"
  const extractProjectName = (fileName: string): string => {
    // Remove .zip extension first
    let name = fileName.replace(/\.zip$/i, '')
    // Remove browser duplicate suffix like " (1)", " (2)", etc.
    name = name.replace(/\s*\(\d+\)$/, '')
    // Remove .embeddablecut suffix
    name = name.replace(/\.embeddablecut$/i, '')
    return name
  }

  // Check if file is a valid bundle (handles browser-renamed files like "project.embeddablecut (1).zip")
  const isValidBundleFile = (fileName: string): boolean => {
    // Match: anything.embeddablecut.zip or anything.embeddablecut (N).zip
    return /\.embeddablecut(\s*\(\d+\))?\.zip$/i.test(fileName)
  }

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner'
  import Plus from 'lucide-svelte/icons/plus'
  import Upload from 'lucide-svelte/icons/upload'
  import FolderOpen from 'lucide-svelte/icons/folder-open'
  import FileIcon from 'lucide-svelte/icons/file'
  import BookOpen from 'lucide-svelte/icons/book-open'
  import { Link, useNavigate } from '$lib/router'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  import EmbeddableCutLogo from '@/components/brand/embeddablecut-logo.svelte'
  import Trans from '@/components/trans.svelte'
  import ProjectList from '@/features/projects/components/project-list.svelte'
  import { EditProjectForm } from '@/features/projects/components/project-form'
  import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
  } from '@/components/ui/dialog'
  import { Progress } from '@/components/ui/progress'
  import { useProjectActions } from '@/features/projects/hooks/use-project-actions.svelte'
  import {
    useProjects,
    useProjectsLoading,
    useProjectsError,
  } from '@/features/projects/hooks/use-project-selectors.svelte'
  import type { Project } from '@/types/project'
  import type { ProjectFormData } from '@/features/projects/utils/validation'
  import type { ImportProgress } from '@/features/project-bundle/types/bundle'
  import { BUNDLE_EXTENSION } from '@/features/project-bundle/types/bundle'
  import LegacyMigrationBanner from '@/features/projects/components/legacy-migration-banner.svelte'
  import LegacyMigrationErrors from '@/features/projects/components/legacy-migration-errors.svelte'
  import TrashSection from '@/features/projects/components/trash-section.svelte'
  import { WorkspaceIndicator } from '@/features/workspace-gate'
  import LanguageSwitcher from '@/shared/ui/language-switcher.svelte'
  import { t } from '$lib/i18n.svelte'

  const navigate = useNavigate()
  let editingProject = $state.raw<Project | null>(null)
  let isSubmitting = $state(false)

  // Import state - two-step flow
  let fileInput = $state<HTMLInputElement | null>(null)
  let pendingImportFile = $state.raw<File | null>(null)
  let projectNameFromFile = $state<string | null>(null)
  let destinationDir = $state.raw<FileSystemDirectoryHandle | null>(null)
  let destinationName = $state<string | null>(null)
  let useProjectsFolder = $state(true) // Create EmbeddableCutProjects subfolder
  let importDialogOpen = $state(false)
  let importProgress = $state.raw<ImportProgress | null>(null)
  let importError = $state<string | null>(null)
  let isImporting = $state(false)

  const isLoading = useProjectsLoading()
  const projects = useProjects()
  const error = useProjectsError()
  const { loadProjects, updateProject } = useProjectActions()

  // Only show the full-page spinner for the genuine initial load — mutations
  // (delete/duplicate/update) should never blank the populated list.
  const showInitialLoadingSpinner = $derived(isLoading.current && projects.current.length === 0)

  // Load projects on mount
  $effect(() => {
    void loadProjects()
  })

  // Handle import file selection
  function handleImportClick() {
    fileInput?.click()
  }

  // Step 1: File selected - show destination selection dialog
  function handleFileSelect(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0]
    if (!file) return

    // Reset file input for next selection
    event.currentTarget.value = ''

    // Validate file extension (handles browser-renamed files like "project.embeddablecut (1).zip")
    if (!isValidBundleFile(file.name)) {
      importError = t('projects.import.invalidFile', { extension: BUNDLE_EXTENSION })
      importDialogOpen = true
      return
    }

    // Store file and extract project name, then show destination selection dialog
    pendingImportFile = file
    projectNameFromFile = extractProjectName(file.name)
    destinationDir = null
    destinationName = null
    importError = null
    importProgress = null
    isImporting = false
    importDialogOpen = true
  }

  // Step 2: User clicks to select destination folder (fresh user gesture!)
  async function handleSelectDestination() {
    try {
      const dirHandle = await window.showDirectoryPicker({
        id: 'freecut-import',
        mode: 'readwrite',
        startIn: 'documents',
      })
      destinationDir = dirHandle
      destinationName = dirHandle.name
      importError = null
    } catch (err) {
      // User cancelled - ignore
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      // Handle "contains system files" or permission errors
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      ) {
        importError = t('projects.import.cannotSelectSystemFolders')
        return
      }
      logger.error('Failed to select directory:', err)
      importError = t('projects.import.selectDestinationFailed')
    }
  }

  // Step 3: User clicks "Start Import" - begin actual import
  async function handleStartImport() {
    if (!pendingImportFile || !destinationDir) return

    isImporting = true
    importProgress = { percent: 0, stage: 'validating' }

    try {
      // If useProjectsFolder is enabled, create/get the EmbeddableCutProjects subfolder first
      let finalDestination = destinationDir
      if (useProjectsFolder) {
        try {
          finalDestination = await destinationDir.getDirectoryHandle(PROJECTS_FOLDER_NAME, {
            create: true,
          })
        } catch (err) {
          logger.error('Failed to create EmbeddableCutProjects folder:', err)
          throw new Error(t('projects.import.createFolderFailed', { folder: PROJECTS_FOLDER_NAME }))
        }
      }

      const { importProjectBundle } =
        await import('@/features/project-bundle/services/bundle-import-service')

      const result = await importProjectBundle(
        pendingImportFile,
        finalDestination,
        {},
        (progress) => {
          importProgress = progress
        },
      )

      // Reload projects list
      await loadProjects()

      // Close dialog and navigate to the imported project. The close guard
      // reads `isImporting`, which is still set: release it first.
      isImporting = false
      handleCloseImportDialog()
      void navigate({ to: '/editor/$projectId', params: { projectId: result.project.id } })
    } catch (err) {
      logger.error('Import failed:', err)
      importError = err instanceof Error ? err.message : t('projects.import.importFailed')
      importProgress = null
      isImporting = false
    }
  }

  // Reset import dialog state
  function handleCloseImportDialog() {
    if (isImporting) return // Don't close while importing
    importDialogOpen = false
    pendingImportFile = null
    projectNameFromFile = null
    destinationDir = null
    destinationName = null
    importError = null
    importProgress = null
    isImporting = false
  }

  // Compute full destination path for display
  function getFullDestinationPath(): string {
    if (!destinationName) return ''
    const parts = [destinationName]
    if (useProjectsFolder) parts.push(PROJECTS_FOLDER_NAME)
    if (projectNameFromFile) parts.push(projectNameFromFile)
    return parts.join('/')
  }

  function handleEditProject(project: Project) {
    editingProject = project
  }

  async function handleEditSubmit(data: ProjectFormData) {
    if (!editingProject) return

    isSubmitting = true
    try {
      await updateProject(editingProject.id, data)
      editingProject = null
    } catch (cause) {
      logger.error('Failed to update project:', cause)
      toast.error(t('projects.toasts.updateFailed'), { description: t('projects.tryAgain') })
    } finally {
      isSubmitting = false
    }
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Header -->
  <div class="panel-header border-b border-border" data-no-marquee>
    <div class="max-w-[1920px] mx-auto px-6 py-5 flex items-center justify-between">
      <Link to="/">
        <EmbeddableCutLogo variant="full" size="md" class="hover:opacity-80 transition-opacity" />
      </Link>
      <div class="flex items-center gap-3">
        <LanguageSwitcher size="md" align="end" side="bottom" />

        <Separator orientation="vertical" class="h-6" />

        <Button variant="outline" size="lg" class="gap-2 px-4">
          {#snippet child({ props })}
            <Link {...props} to="/docs">
              <BookOpen class="w-4 h-4" />
              Docs
            </Link>
          {/snippet}
        </Button>

        <Separator orientation="vertical" class="h-6" />

        <WorkspaceIndicator />
        <Button variant="outline" size="lg" class="gap-2 px-4" onclick={handleImportClick}>
          <Upload class="w-4 h-4" />
          {t('projects.importProject')}
        </Button>
        <Link to="/projects/new">
          <Button size="lg" class="gap-2 px-4">
            <Plus class="w-4 h-4" />
            {t('projects.newProject')}
          </Button>
        </Link>
      </div>

      <!-- Hidden file input for import -->
      <input
        bind:this={fileInput}
        type="file"
        accept=".zip"
        onchange={handleFileSelect}
        class="hidden"
      />
    </div>
  </div>

  <!-- Error state -->
  {#if error.current}
    <div class="max-w-[1920px] mx-auto px-6 py-4">
      <div class="panel-bg border border-destructive/50 rounded-lg p-4 text-destructive">
        <p class="font-medium">{t('projects.errorLoading')}</p>
        <p class="text-sm mt-1">{error.current}</p>
      </div>
    </div>
  {/if}

  <!-- Legacy IDB migration banner — appears only when old data is present and unmigrated -->
  <div class="max-w-[1920px] mx-auto px-6 pt-6 space-y-3">
    <LegacyMigrationBanner onMigrated={loadProjects} />
    <!-- Retry banner — appears only when a previous migration left failed items behind -->
    <LegacyMigrationErrors onRetried={loadProjects} />
  </div>

  <!-- Loading state -->
  {#if showInitialLoadingSpinner}
    <div class="max-w-[1920px] mx-auto px-6 py-16 flex items-center justify-center">
      <div class="text-center">
        <div
          class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-4"
        ></div>
        <p class="text-muted-foreground">{t('projects.loadingProjects')}</p>
      </div>
    </div>
  {:else}
    <!-- Projects List -->
    <div class="max-w-[1920px] mx-auto px-6 py-8">
      <ProjectList onEditProject={handleEditProject} onImportProject={handleImportClick} />
      <TrashSection />
    </div>
  {/if}
</div>

<!-- Edit Project Dialog -->
<Dialog
  bind:open={
    () => !!editingProject,
    (open) => {
      if (!open) editingProject = null
    }
  }
>
  <DialogContent class="max-w-[1200px] w-[95vw] max-h-[90vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle class="text-2xl">{t('projects.form.editTitle')}</DialogTitle>
      <DialogDescription>{t('projects.form.editSubtitle')}</DialogDescription>
    </DialogHeader>
    {#if editingProject}
      <EditProjectForm
        onSubmit={handleEditSubmit}
        onCancel={() => (editingProject = null)}
        defaultValues={{
          name: editingProject.name,
          description: editingProject.description,
          width: editingProject.metadata.width,
          height: editingProject.metadata.height,
          fps: editingProject.metadata.fps,
        }}
        {isSubmitting}
      />
    {/if}
  </DialogContent>
</Dialog>

<!-- Import Project Dialog - Two Step Flow -->
<Dialog
  bind:open={
    () => importDialogOpen,
    (open) => {
      if (!open) handleCloseImportDialog()
    }
  }
>
  <DialogContent class="max-w-md">
    <DialogHeader>
      <DialogTitle>
        {importError
          ? t('projects.import.importFailedTitle')
          : isImporting
            ? t('projects.import.importingTitle')
            : t('projects.import.importTitle')}
      </DialogTitle>
      {#if !importError && !isImporting && pendingImportFile}
        <DialogDescription>{t('projects.import.selectWhereToExtract')}</DialogDescription>
      {/if}
      {#if !importError && isImporting && importProgress}
        <DialogDescription>
          {#if importProgress.stage === 'validating'}
            {t('projects.import.stageValidating')}
          {:else if importProgress.stage === 'extracting'}
            {importProgress.currentFile
              ? t('projects.import.stageExtractingFile', { file: importProgress.currentFile })
              : t('projects.import.stageExtracting')}
          {:else if importProgress.stage === 'importing_media'}
            {importProgress.currentFile
              ? t('projects.import.stageImportingFile', { file: importProgress.currentFile })
              : t('projects.import.stageImporting')}
          {:else if importProgress.stage === 'linking'}
            {t('projects.import.stageLinking')}
          {:else if importProgress.stage === 'complete'}
            {t('projects.import.stageComplete')}
          {/if}
        </DialogDescription>
      {/if}
    </DialogHeader>

    {#if importError && !pendingImportFile}
      <!-- Fatal error state - no file -->
      <div class="space-y-4">
        <p class="text-sm text-destructive">{importError}</p>
        <Button variant="outline" class="w-full" onclick={handleCloseImportDialog}>
          {t('common.close')}
        </Button>
      </div>
    {:else if isImporting && importProgress}
      <!-- Importing state - show progress -->
      <div class="space-y-4">
        <Progress value={importProgress.percent} class="h-2" />
        <p class="text-sm text-muted-foreground text-center">
          {Math.round(importProgress.percent)}%
        </p>
      </div>
    {:else if pendingImportFile}
      <!-- Destination selection state -->
      <div class="space-y-4">
        <!-- File info -->
        <div class="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <FileIcon class="w-8 h-8 text-muted-foreground flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-sm truncate">{pendingImportFile.name}</p>
            <p class="text-xs text-muted-foreground">
              {formatFileSize(pendingImportFile.size)}
            </p>
          </div>
        </div>

        <!-- Destination selection -->
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium">{t('projects.import.destinationFolder')}</p>
            {#if !destinationDir}
              <p class="text-xs text-muted-foreground">
                {t('projects.import.useNewFolderIfNeeded')}
              </p>
            {/if}
          </div>
          <Button
            variant="outline"
            class="w-full justify-start gap-2"
            onclick={() => void handleSelectDestination()}
          >
            <FolderOpen class="w-4 h-4" />
            {#if destinationName}
              <span class="truncate">{destinationName}</span>
            {:else}
              <span class="text-muted-foreground">
                {t('projects.import.selectOrCreateFolder')}
              </span>
            {/if}
          </Button>

          <!-- EmbeddableCutProjects subfolder option -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={useProjectsFolder}
              class="w-4 h-4 rounded border-border accent-primary"
            />
            <span class="text-sm">
              <Trans
                i18nKey="projects.import.createInSubfolder"
                values={{ folder: PROJECTS_FOLDER_NAME }}
              >
                {#snippet code(text: string)}<code class="text-xs bg-muted px-1 py-0.5 rounded"
                    >{text}</code
                  >{/snippet}
              </Trans>
            </span>
          </label>

          {#if importError}
            <p class="text-xs text-destructive">{importError}</p>
          {/if}
          {#if destinationDir && !importError}
            <div class="p-3 bg-muted/50 rounded-lg border border-border">
              <p class="text-xs text-muted-foreground mb-1">
                {t('projects.import.mediaWillBeSavedTo')}
              </p>
              <p class="text-sm font-semibold text-foreground break-all">
                {getFullDestinationPath()}
              </p>
            </div>
          {/if}
        </div>

        <DialogFooter class="gap-2 sm:gap-0">
          <Button variant="outline" onclick={handleCloseImportDialog}>
            {t('common.cancel')}
          </Button>
          <Button onclick={() => void handleStartImport()} disabled={!destinationDir}>
            {t('projects.import.startImport')}
          </Button>
        </DialogFooter>
      </div>
    {/if}
  </DialogContent>
</Dialog>
