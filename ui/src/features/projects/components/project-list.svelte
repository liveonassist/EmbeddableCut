<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  interface MarqueeRect {
    x: number
    y: number
    width: number
    height: number
  }

  const MARQUEE_DRAG_THRESHOLD = 4

  const INTERACTIVE_SELECTOR =
    'button, a, input, textarea, select, label, [role="menu"], [role="menuitem"], [role="dialog"], [role="listbox"], [role="combobox"], [role="option"], [role="alertdialog"], [data-project-card], [data-bits-floating-content-wrapper], [data-dialog-overlay], [data-alert-dialog-overlay]'

  function isMarqueeBlocked(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true
    // Block if inside any interactive widget, dropdown, or modal
    if (target.closest(INTERACTIVE_SELECTOR)) return true
    // Block if any modal is open (e.g. Edit dialog, bulk delete confirm)
    if (
      document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      )
    )
      return true
    // Block in the Trash section — it has its own interactions
    if (target.closest('[data-no-marquee]')) return true
    return false
  }
</script>

<script lang="ts">
  import { toast } from 'svelte-sonner'
  import Search from 'lucide-svelte/icons/search'
  import ArrowUpDown from 'lucide-svelte/icons/arrow-up-down'
  import X from 'lucide-svelte/icons/x'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle'
  import Plus from 'lucide-svelte/icons/plus'
  import Upload from 'lucide-svelte/icons/upload'
  import { Link } from '@/app/router'
  import { Input } from '@/components/ui/input'
  import { Button } from '@/components/ui/button'
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
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
  import { getUniqueResolutions, getUniqueFps } from '@/features/projects/utils/project-helpers'
  import type { Project } from '@/types/project'
  import { t } from '$lib/i18n.svelte'
  import ProjectCard from './project-card.svelte'
  import {
    useFilteredProjects,
    useSortField,
    useSortDirection,
    useFilterResolution,
    useFilterFps,
    useHasActiveFilters,
    useProjects,
  } from '../hooks/use-project-selectors.svelte'
  import { useProjectFilters, useDeleteProject } from '../hooks/use-project-actions.svelte'

  interface ProjectListProps {
    onEditProject?: (project: Project) => void
    onImportProject?: () => void
  }

  let { onEditProject, onImportProject }: ProjectListProps = $props()

  let localSearchQuery = $state('')
  let selectedIds = $state.raw<Set<string>>(new Set())
  let anchorId = $state<string | null>(null)
  let showBulkDeleteDialog = $state(false)
  let isBulkDeleting = $state(false)

  // Marquee state
  let container = $state<HTMLDivElement | null>(null)
  let marquee = $state.raw<MarqueeRect | null>(null)
  let marqueeStart: {
    x: number
    y: number
    baseSelection: Set<string>
    additive: boolean
  } | null = null

  const allProjects = useProjects()
  const filteredProjects = useFilteredProjects()
  const sortField = useSortField()
  const sortDirection = useSortDirection()
  const filterResolution = useFilterResolution()
  const filterFps = useFilterFps()
  const hasActiveFilters = useHasActiveFilters()

  const {
    setSearchQuery,
    setSortField,
    setSortDirection,
    setFilterResolution,
    setFilterFps,
    clearFilters,
  } = useProjectFilters()
  const deleteProject = useDeleteProject()

  const uniqueResolutions = $derived(getUniqueResolutions(allProjects.current))
  const uniqueFps = $derived(getUniqueFps(allProjects.current))

  // Prune selections that disappear (e.g. after deletion or filtering changes)
  $effect(() => {
    const visibleIds = new Set(filteredProjects.current.map((p) => p.id))
    const prev = selectedIds
    let changed = false
    const next = new Set<string>()
    for (const id of prev) {
      if (visibleIds.has(id)) {
        next.add(id)
      } else {
        changed = true
      }
    }
    if (changed) selectedIds = next
  })

  function handleSearchChange(value: string) {
    localSearchQuery = value
    setTimeout(() => {
      setSearchQuery(value)
    }, 300)
  }

  function handleClearFilters() {
    localSearchQuery = ''
    clearFilters()
  }

  function toggleSortDirection() {
    setSortDirection(sortDirection.current === 'asc' ? 'desc' : 'asc')
  }

  function clearSelection() {
    selectedIds = new Set()
    anchorId = null
  }

  function handleCardClick(e: MouseEvent, project: Project) {
    // If marquee actually dragged, cancel click-selection
    if (marqueeStart) return

    const projects = filteredProjects.current
    const id = project.id
    if (e.shiftKey && anchorId) {
      // Range select
      const startIdx = projects.findIndex((p) => p.id === anchorId)
      const endIdx = projects.findIndex((p) => p.id === id)
      if (startIdx >= 0 && endIdx >= 0) {
        const [from, to] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
        const range = projects.slice(from, to + 1).map((p) => p.id)
        selectedIds = new Set(range)
        return
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      selectedIds = next
      anchorId = id
      return
    }

    // Plain click: select only this one
    selectedIds = new Set([id])
    anchorId = id
  }

  // Marquee/deselect: listen at the document level so it works from the
  // viewport gutters (outside the centered content container), not just
  // inside the grid box.
  $effect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (!container) return // ProjectList grid not mounted
      if (isMarqueeBlocked(e.target)) return

      const additive = e.ctrlKey || e.metaKey || e.shiftKey
      marqueeStart = {
        x: e.clientX,
        y: e.clientY,
        baseSelection: additive ? new Set(selectedIds) : new Set(),
        additive,
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const start = marqueeStart
      if (!start) return

      const dx = e.clientX - start.x
      const dy = e.clientY - start.y

      if (!marquee && Math.hypot(dx, dy) < MARQUEE_DRAG_THRESHOLD) return

      // Viewport-space rectangle
      const x = Math.min(start.x, e.clientX)
      const y = Math.min(start.y, e.clientY)
      const width = Math.abs(dx)
      const height = Math.abs(dy)
      const right = x + width
      const bottom = y + height

      marquee = { x, y, width, height }

      const hits = new Set<string>(start.baseSelection)
      const cards = document.querySelectorAll<HTMLElement>('[data-project-card]')
      cards.forEach((el) => {
        const r = el.getBoundingClientRect()
        const intersects = r.left < right && r.right > x && r.top < bottom && r.bottom > y
        const id = el.dataset.projectId
        if (!id) return
        if (intersects) {
          if (start.additive && start.baseSelection.has(id)) {
            hits.delete(id)
          } else {
            hits.add(id)
          }
        }
      })
      selectedIds = hits
    }

    const handleMouseUp = () => {
      const wasMarquee = marquee !== null
      const hadStart = marqueeStart !== null
      marqueeStart = null
      marquee = null

      // Plain click in the gutter / empty area → deselect
      if (hadStart && !wasMarquee) {
        clearSelection()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  })

  // Keyboard: Escape clears, Delete triggers bulk delete, Ctrl/Cmd+A selects all
  $effect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (inInput) return

      if (e.key === 'Escape' && selectedIds.size > 0) {
        clearSelection()
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        showBulkDeleteDialog = true
        return
      }

      const projects = filteredProjects.current
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && projects.length > 0) {
        e.preventDefault()
        selectedIds = new Set(projects.map((p) => p.id))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  async function handleConfirmBulkDelete() {
    isBulkDeleting = true
    const ids = Array.from(selectedIds)
    const results = await Promise.all(ids.map((id) => deleteProject(id, false)))
    const failures = results.filter((r) => !r.success)
    isBulkDeleting = false
    showBulkDeleteDialog = false
    clearSelection()

    if (failures.length === 0) {
      toast.success(t('projects.list.movedToTrashCount', { count: ids.length }))
    } else if (failures.length < ids.length) {
      toast.warning(
        t('projects.list.movedToTrashPartial', {
          moved: ids.length - failures.length,
          failed: failures.length,
        }),
        {
          description: failures[0]?.error ?? undefined,
        },
      )
    } else {
      toast.error(t('projects.list.deleteSelectedFailed'), {
        description: failures[0]?.error ?? undefined,
      })
    }
  }

  const isEmpty = $derived(allProjects.current.length === 0)
  const hasNoResults = $derived(!isEmpty && filteredProjects.current.length === 0)
  const selectionCount = $derived(selectedIds.size)

  function sortMark(field: string): string {
    return sortField.current === field ? `(${sortDirection.current === 'asc' ? '↑' : '↓'})` : ''
  }
</script>

<div class="space-y-6">
  <!-- Search and Filters Bar -->
  {#if !isEmpty}
    <div class="flex items-center gap-3">
      <!-- Search -->
      <div class="relative flex-1 max-w-md">
        <Search
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        />
        <Input
          type="text"
          placeholder={t('projects.list.searchPlaceholder')}
          value={localSearchQuery}
          oninput={(e: Event) => handleSearchChange((e.currentTarget as HTMLInputElement).value)}
          class="pl-9 pr-9"
        />
        {#if localSearchQuery}
          <Button
            variant="ghost"
            size="icon"
            class="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onclick={() => handleSearchChange('')}
          >
            <X class="w-3 h-3" />
          </Button>
        {/if}
      </div>

      <!-- Resolution Filter -->
      <Select
        value={filterResolution.current || 'all'}
        onValueChange={(value) => setFilterResolution(value === 'all' ? undefined : value)}
      >
        <SelectTrigger class="w-[180px]">
          <SelectValue placeholder={t('projects.list.allResolutions')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('projects.list.allResolutions')}</SelectItem>
          {#each uniqueResolutions as res (res)}
            <SelectItem value={res}>
              {res}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>

      <!-- FPS Filter -->
      <Select
        value={filterFps.current?.toString() || 'all'}
        onValueChange={(value) => setFilterFps(value === 'all' ? undefined : Number(value))}
      >
        <SelectTrigger class="w-[140px]">
          <SelectValue placeholder={t('projects.list.allFps')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('projects.list.allFps')}</SelectItem>
          {#each uniqueFps as fps (fps)}
            <SelectItem value={fps.toString()}>
              {t('projects.list.fpsOption', { fps })}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>

      <!-- Sort Menu -->
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="icon">
              <ArrowUpDown class="w-4 h-4" />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuLabel>{t('projects.list.sortBy')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onclick={() => setSortField('name')}>
            {t('projects.list.sortName')}
            {sortMark('name')}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => setSortField('updatedAt')}>
            {t('projects.list.sortLastModified')}
            {sortMark('updatedAt')}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => setSortField('createdAt')}>
            {t('projects.list.sortDateCreated')}
            {sortMark('createdAt')}
          </DropdownMenuItem>
          <DropdownMenuItem onclick={() => setSortField('resolution')}>
            {t('projects.list.sortResolution')}
            {sortMark('resolution')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onclick={toggleSortDirection}>
            {sortDirection.current === 'asc'
              ? t('projects.list.ascending')
              : t('projects.list.descending')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Clear Filters -->
      {#if hasActiveFilters.current}
        <Button variant="ghost" size="sm" onclick={handleClearFilters}>
          <X class="w-4 h-4 mr-2" />
          {t('projects.list.clearFilters')}
        </Button>
      {/if}

      <!-- Spacer -->
      <div class="flex-1"></div>

      <!-- Selection controls -->
      {#if selectionCount > 0}
        <span class="text-sm text-muted-foreground whitespace-nowrap">
          {t('projects.list.selectedCount', { count: selectionCount })}
        </span>
        <Button variant="ghost" size="sm" onclick={clearSelection}>
          {t('projects.list.clearSelection')}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          class="gap-2"
          onclick={() => (showBulkDeleteDialog = true)}
        >
          <Trash2 class="w-4 h-4" />
          {t('projects.list.deleteN', { count: selectionCount })}
        </Button>
      {/if}
    </div>
  {/if}

  <!-- Empty State - No Projects -->
  {#if isEmpty}
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
      <h2 class="text-3xl font-semibold text-foreground mb-2">
        {t('projects.list.welcomeTitle')}
      </h2>
      <p class="text-muted-foreground max-w-md mb-6">
        {t('projects.list.welcomeDescription')}
      </p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" class="gap-2">
          {#snippet child({ props })}
            <Link {...props} to="/projects/new">
              <Plus class="w-4 h-4" />
              {t('projects.list.createFirstProject')}
            </Link>
          {/snippet}
        </Button>
        {#if onImportProject}
          <Button variant="outline" size="lg" class="gap-2" onclick={onImportProject}>
            <Upload class="w-4 h-4" />
            {t('projects.list.importExistingProject')}
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Empty State - No Search Results -->
  {#if hasNoResults}
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div class="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Search class="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 class="text-xl font-semibold text-foreground mb-2">
        {t('projects.list.noResultsTitle')}
      </h3>
      <p class="text-muted-foreground max-w-md mb-6">
        {t('projects.list.noResultsDescription')}
      </p>
      <Button variant="outline" onclick={handleClearFilters}>
        {t('projects.list.clearFilters')}
      </Button>
    </div>
  {/if}

  <!-- Project Grid -->
  {#if !isEmpty && !hasNoResults}
    <div>
      <div class="flex items-center justify-between mb-4">
        <p class="text-sm text-muted-foreground">
          {filteredProjects.current.length === allProjects.current.length
            ? t('projects.list.projectCount', { count: allProjects.current.length })
            : t('projects.list.projectCountFiltered', {
                shown: filteredProjects.current.length,
                total: allProjects.current.length,
              })}
        </p>
      </div>

      <div bind:this={container} class="relative -mx-3 px-3 py-2 min-h-[200px]">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {#each filteredProjects.current as project (project.id)}
            <ProjectCard
              {project}
              onEdit={onEditProject}
              isSelected={selectedIds.has(project.id)}
              onCardClick={handleCardClick}
            />
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Viewport-fixed marquee overlay -->
  {#if marquee}
    <div
      class="fixed pointer-events-none border border-primary bg-primary/10 rounded-sm z-40"
      style:left="{marquee.x}px"
      style:top="{marquee.y}px"
      style:width="{marquee.width}px"
      style:height="{marquee.height}px"
    ></div>
  {/if}

  <!-- Bulk delete confirm -->
  <AlertDialog bind:open={showBulkDeleteDialog}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle class="flex items-center gap-2">
          <AlertTriangle class="h-5 w-5 text-destructive" />
          {t('projects.list.bulkDeleteTitle', { count: selectionCount })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t('projects.list.bulkDeleteDescription')}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isBulkDeleting}>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onclick={() => void handleConfirmBulkDelete()}
          disabled={isBulkDeleting}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isBulkDeleting
            ? t('common.deleting')
            : t('projects.list.deleteN', { count: selectionCount })}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
