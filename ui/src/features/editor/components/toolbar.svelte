<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const SAVE_ANIMATION_MIN_MS = 1800

  function formatProjectDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }
</script>

<script lang="ts">
  import ArrowLeft from 'lucide-svelte/icons/arrow-left'
  import BookOpen from 'lucide-svelte/icons/book-open'
  import Bug from 'lucide-svelte/icons/bug'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import Download from 'lucide-svelte/icons/download'
  import FolderArchive from 'lucide-svelte/icons/folder-archive'
  import Github from 'lucide-svelte/icons/github'
  import Keyboard from 'lucide-svelte/icons/keyboard'
  import ListVideo from 'lucide-svelte/icons/list-video'
  import Save from 'lucide-svelte/icons/save'
  import Settings from 'lucide-svelte/icons/settings'
  import Sparkles from 'lucide-svelte/icons/sparkles'
  import Video from 'lucide-svelte/icons/video'
  import { select, shallow } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import DiscordIcon from '@/components/brand/discord-icon.svelte'
  import Contribution from '@/components/contribution.svelte'
  import ContributionIcon from '@/components/contribution-icon.svelte'
  import { DISCORD_INVITE_URL } from '@/config/community'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
  import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
  import { Separator } from '@/components/ui/separator'
  import type { ToolbarContribution } from '../../../extensions/contributions'
  import LocalInferenceStatusPill from './local-inference-status-pill.svelte'
  import ProjectDebugPanel from './project-debug-panel.svelte'
  import SettingsDialog from './settings-dialog.svelte'
  import ShortcutsDialog from './shortcuts-dialog.svelte'
  import UnsavedChangesDialog from './unsaved-changes-dialog.svelte'
  import WorkspaceSwitcher from './workspace-switcher.svelte'
  import WhatsNewDialog from './whats-new-dialog.svelte'
  import { hasUnseenChangelog } from './whats-new-seen'
  import type { EditorProject } from './editor/types'
  import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
  import { cn } from '@/shared/ui/cn'
  import LanguageSwitcher from '@/shared/ui/language-switcher.svelte'
  import { useDebugStore } from '@/features/editor/stores/debug-store'
  import { useItemsStore, useTimelineSettingsStore } from '@/features/editor/deps/timeline-store'
  import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
  import { maybeEditorUi } from '../editor-ui'
  import { findRouter } from '@/app/router'

  interface ToolbarProps {
    projectId: string
    project: EditorProject
    onSave?: () => Promise<void>
    onExport?: () => void
    onExportBundle?: () => void
    onOpenRenderQueue?: () => void
    /** Number of queued + rendering jobs, shown as a badge on the queue button. */
    renderQueueCount?: number
  }

  let {
    projectId,
    project,
    onSave,
    onExport,
    onExportBundle,
    onOpenRenderQueue,
    renderQueueCount = 0,
  }: ToolbarProps = $props()

  const editorUi = maybeEditorUi()
  const projectMenu = $derived(editorUi?.contributions.replacement('project-menu') ?? null)
  const leftItems = $derived(editorUi?.contributions.toolbar('left') ?? [])
  const centerItems = $derived(editorUi?.contributions.toolbar('center') ?? [])
  const rightItems = $derived(editorUi?.contributions.toolbar('right') ?? [])

  // The app's projects page, when the editor runs inside the app; a
  // mounted editor has no pages to go back to.
  const router = findRouter()

  let showUnsavedDialog = $state(false)
  let showShortcutsDialog = $state(false)
  let showSettingsDialog = $state(false)
  let showWhatsNewDialog = $state(false)
  let hasUnseenWhatsNew = $state(hasUnseenChangelog())
  let isSaveAnimating = $state(false)
  let saveAnimationKey = $state(0)
  let saveAnimationTimeout: number | undefined
  const isDirty = select(useTimelineSettingsStore, (state) => state.isDirty)
  const itemCount = select(useItemsStore, (state) => state.items.length)
  const maxItemEndFrame = select(useItemsStore, (state) => state.maxItemEndFrame)
  const mediaDependencyIds = select(useItemsStore, (state) => state.mediaDependencyIds, shallow)
  const brokenMediaIds = select(useMediaLibraryStore, (state) => state.brokenMediaIds, shallow)
  const projectSummary = $derived.by(() => {
    const projectMediaIds = new Set(mediaDependencyIds.current)
    return {
      durationSeconds: project.fps > 0 ? maxItemEndFrame.current / project.fps : 0,
      clipCount: itemCount.current,
      mediaCount: mediaDependencyIds.current.length,
      brokenMediaCount: brokenMediaIds.current.filter((mediaId) => projectMediaIds.has(mediaId))
        .length,
    }
  })

  const debugPanelOpen = select(useDebugStore, (s) => s.debugPanelOpen)
  const showDebugPanel = import.meta.env.DEV && import.meta.env.VITE_SHOW_DEBUG_PANEL !== 'false'

  $effect(() => {
    return () => {
      if (saveAnimationTimeout !== undefined) {
        window.clearTimeout(saveAnimationTimeout)
      }
    }
  })

  function openWhatsNew() {
    hasUnseenWhatsNew = false
    showWhatsNewDialog = true
  }

  function handleBackClick() {
    if (useTimelineSettingsStore.getState().isDirty) {
      showUnsavedDialog = true
    } else {
      void router?.navigate({ to: '/projects' })
    }
  }

  async function handleSave() {
    const startedAt = performance.now()
    const finishSaveAnimation = () => {
      const remainingMs = Math.max(0, SAVE_ANIMATION_MIN_MS - (performance.now() - startedAt))

      saveAnimationTimeout = window.setTimeout(() => {
        isSaveAnimating = false
        saveAnimationTimeout = undefined
      }, remainingMs)
    }

    if (saveAnimationTimeout !== undefined) {
      window.clearTimeout(saveAnimationTimeout)
    }

    saveAnimationKey += 1
    isSaveAnimating = true

    if (onSave) {
      try {
        await onSave()
      } finally {
        finishSaveAnimation()
      }
    } else {
      finishSaveAnimation()
    }
  }
</script>

{#snippet contributedItem(item: ToolbarContribution)}
  {#if editorUi}
    {#if item.content}
      <Contribution content={item.content} context={{ editor: editorUi.editor }} class="flex items-center" />
    {:else}
      <Button
        variant="outline"
        size="icon"
        class="h-7 w-7"
        onclick={() => item.onSelect?.({ editor: editorUi.editor })}
        data-tooltip={item.label}
        data-tooltip-side="bottom"
        aria-label={item.label}
        data-contribution-id={item.id}
      >
        {#if item.icon}
          <ContributionIcon icon={item.icon} class="h-4 w-4" />
        {:else}
          <span class="text-[10px] font-medium leading-none">{item.label}</span>
        {/if}
      </Button>
    {/if}
  {/if}
{/snippet}

{#snippet saveAnimationIcon(className: string)}
  <svg
    class={className}
    version="1.1"
    id="L6"
    xmlns="http://www.w3.org/2000/svg"
    x="0px"
    y="0px"
    viewBox="12 12 76 76"
    enable-background="new 12 12 76 76"
    xml:space="preserve"
    aria-hidden="true"
  >
    <rect fill="none" stroke="currentColor" stroke-width="4" x="25" y="25" width="50" height="50">
      <animateTransform
        attributeName="transform"
        dur="0.5s"
        from="0 50 50"
        to="180 50 50"
        type="rotate"
        id="strokeBox"
        attributeType="XML"
        begin="rectBox.end"
      />
    </rect>
    <rect x="27" y="27" fill="currentColor" width="46" height="50">
      <animate
        attributeName="height"
        dur="1.3s"
        attributeType="XML"
        from="50"
        to="0"
        id="rectBox"
        fill="freeze"
        begin="0s;strokeBox.end"
      />
    </rect>
  </svg>
{/snippet}

{#snippet debugPopover()}
  <Popover
    bind:open={() => debugPanelOpen.current, (open) => useDebugStore.getState().setDebugPanelOpen(open)}
  >
    <PopoverTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          class={cn(
            'h-7 w-7',
            debugPanelOpen.current && 'bg-amber-500/20 border-amber-500/50 text-amber-400',
          )}
          data-tooltip={debugPanelOpen.current ? undefined : t('toolbar.debugPanel')}
          data-tooltip-side="bottom"
          aria-label={t('toolbar.debugPanelAria')}
        >
          <Bug class="h-4 w-4" />
        </Button>
      {/snippet}
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} class="w-64 p-0 bg-zinc-900 border-zinc-700 text-zinc-100">
      <ProjectDebugPanel {projectId} />
    </PopoverContent>
  </Popover>
{/snippet}

<div
  class="panel-header flex flex-shrink-0 items-center gap-2.5 border-b border-border px-3"
  style:height={EDITOR_LAYOUT_CSS_VALUES.toolbarHeight}
  role="toolbar"
  aria-label={t('toolbar.ariaLabel')}
>
  <div class="flex items-center gap-2.5">
    {#if projectMenu && editorUi}
      <Contribution content={projectMenu} context={{ editor: editorUi.editor }} class="flex items-center" />
    {:else}
      {#if router}
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={handleBackClick}
          data-tooltip={t('toolbar.backToProjects')}
          data-tooltip-side="right"
          aria-label={t('toolbar.backToProjectsAria')}
        >
          <ArrowLeft class="h-4 w-4" />
        </Button>

        <UnsavedChangesDialog
          open={showUnsavedDialog}
          onOpenChange={(open) => (showUnsavedDialog = open)}
          onSave={handleSave}
          onLeave={() => void router.navigate({ to: '/projects' })}
          projectName={project?.name}
        />

        <Separator orientation="vertical" class="h-5" />
      {/if}

      <div class="flex flex-col -space-y-0.5">
        <h1 class="text-sm font-medium leading-none">
          {project?.name || t('common.untitledProject')}
        </h1>
        <span class="font-mono text-[11px] text-muted-foreground">
          {t('toolbar.specsDetailed', {
            width: project?.width,
            height: project?.height,
            fps: project?.fps,
            duration: formatProjectDuration(projectSummary.durationSeconds),
            clips: projectSummary.clipCount,
            media: projectSummary.mediaCount,
            missing: projectSummary.brokenMediaCount,
          })}
        </span>
      </div>
    {/if}
    {#each leftItems as item (item.id)}
      {@render contributedItem(item)}
    {/each}
  </div>

  <div class="flex flex-1 items-center justify-center gap-1.5">
    <WorkspaceSwitcher />
    {#each centerItems as item (item.id)}
      {@render contributedItem(item)}
    {/each}
  </div>

  <LocalInferenceStatusPill />

  <ShortcutsDialog bind:open={showShortcutsDialog} />

  <SettingsDialog bind:open={showSettingsDialog} />

  <WhatsNewDialog bind:open={showWhatsNewDialog} />

  <div class="flex items-center gap-1.5">
    {#if showDebugPanel}
      {@render debugPopover()}
    {/if}

    <!-- Socials -->
    <Button variant="outline" size="icon" class="h-7 w-7">
      {#snippet child({ props })}
        <a
          {...props}
          href="https://github.com/walterlow/freecut"
          target="_blank"
          rel="noopener noreferrer"
          data-tooltip={t('toolbar.viewOnGitHub')}
          data-tooltip-side="bottom"
          aria-label={t('toolbar.viewOnGitHub')}
        >
          <Github class="h-4 w-4" />
        </a>
      {/snippet}
    </Button>
    <Button variant="outline" size="icon" class="h-7 w-7">
      {#snippet child({ props })}
        <a
          {...props}
          href={DISCORD_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-tooltip={t('toolbar.joinDiscord')}
          data-tooltip-side="bottom"
          aria-label={t('toolbar.joinDiscord')}
        >
          <DiscordIcon class="h-4 w-4" />
        </a>
      {/snippet}
    </Button>

    <Separator orientation="vertical" class="h-5" />

    <!-- Utility -->
    <Button variant="outline" size="icon" class="h-7 w-7">
      {#snippet child({ props })}
        <a
          {...props}
          href="/docs"
          target="_blank"
          rel="noopener noreferrer"
          data-tooltip="User Guide"
          data-tooltip-side="bottom"
          aria-label="User Guide"
        >
          <BookOpen class="h-4 w-4" />
        </a>
      {/snippet}
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="h-7 w-7 relative"
      onclick={openWhatsNew}
      data-tooltip={t('toolbar.whatsNew')}
      data-tooltip-side="bottom"
      aria-label={t('toolbar.whatsNewAria')}
    >
      <Sparkles class="h-4 w-4" />
      {#if hasUnseenWhatsNew}
        <span class="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true"></span>
      {/if}
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="h-7 w-7"
      onclick={() => (showSettingsDialog = true)}
      data-tooltip={t('toolbar.settings')}
      data-tooltip-side="bottom"
      aria-label={t('toolbar.settings')}
    >
      <Settings class="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="icon"
      class="h-7 w-7"
      onclick={() => (showShortcutsDialog = true)}
      data-tooltip={t('toolbar.keyboardShortcuts')}
      data-tooltip-side="bottom"
      aria-label={t('toolbar.keyboardShortcutsAria')}
    >
      <Keyboard class="h-4 w-4" />
    </Button>
    <LanguageSwitcher size="sm" align="end" side="bottom" />

    <Separator orientation="vertical" class="h-5" />

    <!-- Actions -->
    <Button variant="outline" size="sm" class="gap-1.5" onclick={handleSave} aria-label={t('toolbar.saveAria')}>
      <div class="relative">
        {#if isSaveAnimating}
          {#key saveAnimationKey}
            {@render saveAnimationIcon('h-5 w-5')}
          {/key}
        {:else}
          <Save class="h-4 w-4" />
        {/if}
        {#if isDirty.current}
          <span class="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-orange-500"></span>
        {/if}
      </div>
      {t('toolbar.save')}
    </Button>

    {#if onOpenRenderQueue}
      <Button
        variant="outline"
        size="icon"
        class="h-7 w-7 relative"
        onclick={onOpenRenderQueue}
        data-tooltip={t('toolbar.renderQueue')}
        data-tooltip-side="bottom"
        aria-label={t('toolbar.renderQueueAria')}
      >
        <ListVideo class="h-4 w-4" />
        {#if renderQueueCount > 0}
          <span
            class="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground"
          >
            {renderQueueCount}
          </span>
        {/if}
      </Button>
    {/if}

    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button {...props} size="sm" class="gap-1.5 glow-primary-sm">
            <Download class="h-4 w-4" />
            {t('toolbar.export')}
            <ChevronDown class="h-3 w-3" />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onExport} class="gap-2">
          <Video class="h-4 w-4" />
          {t('toolbar.exportVideo')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportBundle} class="gap-2">
          <FolderArchive class="h-4 w-4" />
          {t('toolbar.downloadProjectZip')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    {#each rightItems as item (item.id)}
      {@render contributedItem(item)}
    {/each}
  </div>
</div>
