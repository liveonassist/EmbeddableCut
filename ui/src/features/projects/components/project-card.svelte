<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { toast } from 'svelte-sonner'
  import MoreVertical from '@lucide/svelte/icons/more-vertical'
  import PlayCircle from '@lucide/svelte/icons/play-circle'
  import Edit2 from '@lucide/svelte/icons/edit-2'
  import Copy from '@lucide/svelte/icons/copy'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Check from '@lucide/svelte/icons/check'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog'
  import { Button } from '@/components/ui/button'
  import Trans from '@/components/trans.svelte'
  import { Link, useNavigate } from '$lib/router'
  import type { Project } from '@/types/project'
  import { formatRelativeTime } from '@/features/projects/utils/project-helpers'
  import {
    DEFAULT_PROJECT_FPS,
    DEFAULT_PROJECT_HEIGHT,
    DEFAULT_PROJECT_WIDTH,
  } from '@/shared/projects/defaults'
  import { t } from '$lib/i18n.svelte'
  import {
    useDeleteProject,
    useDuplicateProject,
    useRestoreProject,
  } from '../hooks/use-project-actions.svelte'
  import { useProjectThumbnail } from '../hooks/use-project-thumbnail.svelte'

  interface ProjectCardProps {
    project: Project
    onEdit?: (project: Project) => void
    isSelected?: boolean
    onCardMouseDown?: (e: MouseEvent, project: Project) => void
    onCardClick?: (e: MouseEvent, project: Project) => void
  }

  let {
    project,
    onEdit,
    isSelected = false,
    onCardMouseDown,
    onCardClick,
  }: ProjectCardProps = $props()

  const navigate = useNavigate()
  let isDeleting = $state(false)
  let isDuplicating = $state(false)
  let showDeleteDialog = $state(false)
  let clearLocalFiles = $state(false)
  const deleteProject = useDeleteProject()
  const restoreProject = useRestoreProject()
  const duplicateProject = useDuplicateProject()
  const thumbnailUrl = useProjectThumbnail(() => project)

  function handleDeleteClick(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    showDeleteDialog = true
  }

  async function handleConfirmDelete() {
    isDeleting = true
    showDeleteDialog = false
    const wantedLocalDelete = clearLocalFiles
    const projectId = project.id
    const result = await deleteProject(projectId, clearLocalFiles)
    isDeleting = false
    clearLocalFiles = false

    if (!result.success) {
      toast.error(t('projects.toasts.deleteFailed'), { description: result.error ?? undefined })
      return
    }

    if (wantedLocalDelete && !result.localFilesDeleted) {
      toast.warning(t('projects.toasts.movedToTrash', { name: result.originalName }), {
        description: t('projects.toasts.localFilesNotRemoved'),
      })
      return
    }

    toast.success(t('projects.toasts.movedToTrash', { name: result.originalName }), {
      description: wantedLocalDelete
        ? t('projects.toasts.localFilesDeleted')
        : t('projects.toasts.canUndo'),
      duration: 8000,
      action: {
        label: t('projects.undo'),
        onClick: async () => {
          const undo = await restoreProject(projectId)
          if (undo.success) {
            toast.success(t('projects.toasts.restored', { name: result.originalName }))
          } else {
            toast.error(t('projects.toasts.restoreFailed'), {
              description: undo.error ?? undefined,
            })
          }
        },
      },
    })
  }

  async function handleDuplicate(e: Event) {
    e.preventDefault()
    e.stopPropagation()

    isDuplicating = true
    const result = await duplicateProject(project.id)
    isDuplicating = false

    if (!result.success) {
      toast.error(t('projects.toasts.duplicateFailed'), {
        description: result.error ?? undefined,
      })
    }
  }

  function handleEdit(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    onEdit?.(project)
  }

  function handleClick(e: MouseEvent) {
    onCardClick?.(e, project)
  }

  function openProject() {
    void navigate({ to: '/editor/$projectId', params: { projectId: project.id } })
  }

  function handleDoubleClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  function handleOpenClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    openProject()
  }

  function handleMouseDown(e: MouseEvent) {
    onCardMouseDown?.(e, project)
  }

  // Safe metadata access with defaults
  const width = $derived(project?.metadata?.width || DEFAULT_PROJECT_WIDTH)
  const height = $derived(project?.metadata?.height || DEFAULT_PROJECT_HEIGHT)
  const fps = $derived(project?.metadata?.fps || DEFAULT_PROJECT_FPS)

  const resolution = $derived(`${width}×${height}`)
  const aspectRatio = $derived(width / height)
  const aspectRatioLabel = $derived(
    Math.abs(aspectRatio - 16 / 9) < 0.01
      ? '16:9'
      : Math.abs(aspectRatio - 4 / 3) < 0.01
        ? '4:3'
        : Math.abs(aspectRatio - 1) < 0.01
          ? '1:1'
          : Math.abs(aspectRatio - 21 / 9) < 0.01
            ? '21:9'
            : `${width}:${height}`,
  )
</script>

<div
  data-project-card
  data-project-id={project.id}
  onmousedown={handleMouseDown}
  onclick={handleClick}
  ondblclick={handleDoubleClick}
  onkeydown={handleKeyDown}
  role="button"
  tabindex={0}
  aria-label={t('projects.card.openProject')}
  class={`group relative panel-bg border rounded-lg overflow-hidden transition-[transform,border-color,box-shadow] duration-150 active:scale-[0.99] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isSelected
      ? 'border-primary ring-2 ring-primary/40 shadow-lg shadow-primary/10'
      : 'border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5'
  }`}
>
  <!-- Selection check badge -->
  {#if isSelected}
    <div
      class="absolute top-2 left-2 z-10 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md pointer-events-none"
    >
      <Check class="w-4 h-4" strokeWidth={3} />
    </div>
  {/if}

  <!-- Thumbnail -->
  <div class="block relative aspect-video bg-secondary/30 overflow-hidden">
    {#if thumbnailUrl.current}
      {#key project.updatedAt}
        <img
          src={thumbnailUrl.current}
          alt={project.name}
          draggable={false}
          class="w-full h-full object-contain bg-black/40 pointer-events-none"
        />
      {/key}
    {:else}
      <div
        class="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/40 to-secondary/20"
      >
        <PlayCircle class="w-12 h-12 text-muted-foreground/40" />
      </div>
    {/if}

    <!-- Hover overlay -->
    <div
      class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center"
    >
      <Button size="sm" class="gap-2" onclick={handleOpenClick}>
        <PlayCircle class="w-4 h-4" />
        {t('projects.card.openProject')}
      </Button>
    </div>

    <!-- Resolution badge -->
    <div
      class="absolute top-2 right-2 px-2 py-1 bg-black/80 backdrop-blur-sm rounded text-xs font-mono text-white pointer-events-none"
    >
      {resolution}
    </div>
  </div>

  <!-- Content -->
  <div class="p-4">
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="flex-1 min-w-0">
        <h3 class="font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        {#if project.description}
          <p class="text-sm text-muted-foreground line-clamp-2 mt-1">
            {project.description}
          </p>
        {/if}
      </div>

      <!-- Actions dropdown -->
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="icon"
              class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onclick={(e: MouseEvent) => {
                ;(props.onclick as ((e: MouseEvent) => void) | undefined)?.(e)
                e.preventDefault()
                e.stopPropagation()
              }}
              onmousedown={(e: MouseEvent) => e.stopPropagation()}
              ondblclick={(e: MouseEvent) => e.stopPropagation()}
            >
              <MoreVertical class="w-4 h-4" />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem class="flex items-center gap-2 cursor-pointer">
            {#snippet child({ props })}
              <Link {...props} to="/editor/$projectId" params={{ projectId: project.id }}>
                <PlayCircle class="w-4 h-4" />
                {t('projects.card.openInEditor')}
              </Link>
            {/snippet}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={handleEdit} class="flex items-center gap-2">
            <Edit2 class="w-4 h-4" />
            {t('projects.card.editSettings')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onclick={(e) => void handleDuplicate(e)}
            disabled={isDuplicating}
            class="flex items-center gap-2"
          >
            <Copy class="w-4 h-4" />
            {isDuplicating ? t('projects.card.duplicating') : t('projects.card.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onclick={handleDeleteClick}
            disabled={isDeleting}
            class="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 class="w-4 h-4" />
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog
      open={showDeleteDialog}
      onOpenChange={(open) => {
        showDeleteDialog = open
        if (!open) clearLocalFiles = false
      }}
    >
      <AlertDialogContent onclick={(e: MouseEvent) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle class="flex items-center gap-2">
            <AlertTriangle class="h-5 w-5 text-destructive" />
            {t('projects.card.deleteProjectTitle')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans i18nKey="projects.card.deleteProjectDescription" values={{ name: project.name }}>
              {#snippet strong(text: string)}<strong>{text}</strong>{/snippet}
            </Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {#if project.rootFolderHandle}
          <label
            class="flex items-start gap-3 p-3 rounded-md bg-muted/50 border border-border cursor-pointer select-none"
          >
            <input
              type="checkbox"
              bind:checked={clearLocalFiles}
              class="mt-0.5 h-4 w-4 rounded border-border accent-destructive"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <HardDrive class="h-3.5 w-3.5 text-muted-foreground" />
                {t('projects.card.alsoDeleteLocalFiles')}
              </div>
              <p class="text-xs text-muted-foreground mt-0.5">
                {project.rootFolderName
                  ? t('projects.card.removeFilesFromNamedFolder', {
                      folder: project.rootFolderName,
                    })
                  : t('projects.card.removeFilesFromFolder')}
              </p>
            </div>
          </label>
        {/if}
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onclick={() => void handleConfirmDelete()}
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('projects.card.deleteProjectTitle')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Metadata -->
    <div class="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
      <div class="flex items-center gap-1.5">
        <span class="font-mono">{aspectRatioLabel}</span>
      </div>
      <div class="w-1 h-1 rounded-full bg-muted-foreground/40"></div>
      <div class="flex items-center gap-1.5">
        <span class="font-mono">{fps}fps</span>
      </div>
      <div class="w-1 h-1 rounded-full bg-muted-foreground/40"></div>
      <div class="flex items-center gap-1.5">
        <span>{formatRelativeTime(project.updatedAt)}</span>
      </div>
    </div>
  </div>
</div>
