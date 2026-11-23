<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog'
  import { useMediaLibraryStore } from '@/features/editor/deps/media-library'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import { changeProjectSettings } from '@/features/editor/deps/timeline-store'
  import { useProjectMediaMatchDialogStore } from '@/shared/state/project-media-match-dialog'
  import {
    getProjectMediaMatchSuggestion,
    isProjectMatchableVideo,
  } from '@/features/editor/utils/project-media-match'

  interface ProjectMediaMatchDialogProps {
    projectId: string
  }

  let { projectId }: ProjectMediaMatchDialogProps = $props()

  const mediaItems = select(useMediaLibraryStore, (state) => state.mediaItems)
  const mediaLoading = select(useMediaLibraryStore, (state) => state.isLoading)
  const currentProject = select(useProjectStore, (state) => state.currentProject)
  const open = select(useProjectMediaMatchDialogStore, (state) => state.isOpen)
  const pendingProjectId = select(useProjectMediaMatchDialogStore, (state) => state.projectId)
  const pendingCandidate = select(useProjectMediaMatchDialogStore, (state) => state.candidate)

  let initialized = false
  let seenVideoIds = new Set<string>()
  let awaitingAutoPrompt = false

  $effect.pre(() => {
    void projectId
    initialized = false
    awaitingAutoPrompt = false
    seenVideoIds = new Set()
  })

  $effect(() => {
    const items = mediaItems.current
    if (mediaLoading.current || !currentProject.current) {
      return
    }
    const id = projectId
    const dialog = useProjectMediaMatchDialogStore.getState()

    const videoItems = items.filter(isProjectMatchableVideo)

    if (!initialized) {
      initialized = true
      seenVideoIds = new Set(videoItems.map((item) => item.id))
      if (videoItems.length > 0) {
        dialog.markProjectMediaMatchHandled(id)
      }
      return
    }

    const newVideos = videoItems.filter((item) => !seenVideoIds.has(item.id))

    for (const item of videoItems) {
      seenVideoIds.add(item.id)
    }

    if (awaitingAutoPrompt || dialog.hasHandledProjectMediaMatch(id)) {
      return
    }

    if (newVideos.length === 0) {
      return
    }

    const firstVideo = [...newVideos].sort((left, right) => left.createdAt - right.createdAt)[0]
    if (!firstVideo) {
      return
    }

    awaitingAutoPrompt = true
    void dialog
      .requestProjectMediaMatch(id, {
        fileName: firstVideo.fileName,
        width: firstVideo.width,
        height: firstVideo.height,
        fps: firstVideo.fps,
      })
      .finally(() => {
        awaitingAutoPrompt = false
      })
  })

  const suggestion = $derived.by(() => {
    const project = currentProject.current
    const candidate = pendingCandidate.current
    if (!project || !candidate || pendingProjectId.current !== projectId) {
      return null
    }

    return getProjectMediaMatchSuggestion(project.metadata, candidate)
  })

  $effect(() => {
    if (
      !open.current ||
      !currentProject.current ||
      !pendingCandidate.current ||
      pendingProjectId.current !== projectId ||
      !suggestion
    ) {
      return
    }

    if (!suggestion.hasChanges) {
      useProjectMediaMatchDialogStore.getState().resolveProjectMediaMatch('keep-current')
    }
  })

  function handleKeepCurrent() {
    useProjectMediaMatchDialogStore.getState().resolveProjectMediaMatch('keep-current')
  }

  function applyMatch(
    choice: 'match-both' | 'fps-only' | 'size-only',
    options: { matchSize: boolean; matchFps: boolean },
  ) {
    const { resolveProjectMediaMatch } = useProjectMediaMatchDialogStore.getState()
    const project = currentProject.current
    if (!project || !pendingCandidate.current || !suggestion) {
      resolveProjectMediaMatch('keep-current')
      return
    }

    const updates: {
      width?: number
      height?: number
      fps?: number
    } = {}

    if (options.matchSize && suggestion.sizeDiffers) {
      updates.width = suggestion.width
      updates.height = suggestion.height
    }

    if (options.matchFps && suggestion.fpsDiffers) {
      updates.fps = suggestion.fps
    }

    if (Object.keys(updates).length === 0) {
      resolveProjectMediaMatch('keep-current')
      return
    }

    // EmbeddableCut: what's on the timeline keeps its times and its place on the canvas.
    changeProjectSettings(updates)
    resolveProjectMediaMatch(choice)
  }

  const dialogOpen = $derived(
    Boolean(open.current && pendingProjectId.current === projectId && suggestion?.hasChanges),
  )
</script>

<Dialog
  bind:open={
    () => dialogOpen,
    (nextOpen) => {
      if (!nextOpen) handleKeepCurrent()
    }
  }
>
  <DialogContent class="sm:max-w-[560px]">
    <DialogHeader>
      <DialogTitle>{t('editor.projectMediaMatch.title')}</DialogTitle>
      <DialogDescription>
        {pendingCandidate.current
          ? t('editor.projectMediaMatch.descriptionWithFile', {
              fileName: pendingCandidate.current.fileName,
            })
          : t('editor.projectMediaMatch.description')}
      </DialogDescription>
    </DialogHeader>

    {#if currentProject.current && pendingCandidate.current && suggestion}
      <div class="space-y-4">
        <div class="rounded-lg border border-border/80 bg-muted/30 p-4">
          <div class="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-2 text-sm">
            <div></div>
            <div class="font-medium text-foreground">
              {t('editor.projectMediaMatch.current')}
            </div>
            <div class="font-medium text-foreground">
              {t('editor.projectMediaMatch.clip')}
            </div>
            <div class="text-muted-foreground">{t('editor.projectMediaMatch.size')}</div>
            <div class="text-muted-foreground">
              {currentProject.current.metadata.width}x{currentProject.current.metadata.height}
            </div>
            <div class="text-muted-foreground">
              {suggestion.width}x{suggestion.height}
            </div>
            <div class="text-muted-foreground">
              {t('editor.projectMediaMatch.frameRate')}
            </div>
            <div class="text-muted-foreground">{currentProject.current.metadata.fps} fps</div>
            <div class="text-muted-foreground">{suggestion.sourceFpsLabel} fps</div>
          </div>
        </div>

        {#if suggestion.fpsWasRounded}
          <p class="text-xs text-muted-foreground">
            {t('editor.projectMediaMatch.fpsRoundedHint', { fps: suggestion.matchedFpsLabel })}
          </p>
        {/if}
      </div>
    {/if}

    <DialogFooter class="gap-2 sm:justify-between">
      <Button variant="ghost" onclick={handleKeepCurrent}>
        {t('editor.projectMediaMatch.keepCurrent')}
      </Button>
      <div class="flex flex-col-reverse gap-2 sm:flex-row">
        {#if suggestion?.sizeDiffers && suggestion?.fpsDiffers}
          <Button
            variant="outline"
            onclick={() => applyMatch('fps-only', { matchSize: false, matchFps: true })}
           
          >
            {t('editor.projectMediaMatch.fpsOnly')}
          </Button>
          <Button
            variant="outline"
            onclick={() => applyMatch('size-only', { matchSize: true, matchFps: false })}
           
          >
            {t('editor.projectMediaMatch.sizeOnly')}
          </Button>
          <Button
            onclick={() => applyMatch('match-both', { matchSize: true, matchFps: true })}
           
          >
            {t('editor.projectMediaMatch.matchBoth')}
          </Button>
        {/if}
        {#if !suggestion?.sizeDiffers && suggestion?.fpsDiffers}
          <Button
            onclick={() => applyMatch('fps-only', { matchSize: false, matchFps: true })}
           
          >
            {t('editor.projectMediaMatch.matchFps')}
          </Button>
        {/if}
        {#if suggestion?.sizeDiffers && !suggestion?.fpsDiffers}
          <Button
            onclick={() => applyMatch('size-only', { matchSize: true, matchFps: false })}
           
          >
            {t('editor.projectMediaMatch.matchSize')}
          </Button>
        {/if}
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>
