<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus'
  import Spline from 'lucide-svelte/icons/spline'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { Button } from '@/components/ui/button'
  import {
    useCompositionNavigationStore,
    useCompositionsStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import PreviewArea from '../../preview-area.svelte'
  import NewCompositionDialog from '../new-composition-dialog.svelte'
  import type { MotionWorkspaceProject } from './shared'

  /**
   * Shared preview adapter for Motion. The preview surface stays the same; only
   * its canvas settings follow the active 2D composition.
   */
  let { project }: { project: MotionWorkspaceProject } = $props()

  let createDialogOpen = $state(false)
  const activeCompositionId = select(useCompositionNavigationStore, (state) => state.activeCompositionId)
  // Derived rather than selected: a selector closing over the active id would
  // only re-run on compositions-store changes, not on navigation.
  const compositionById = select(useCompositionsStore, (state) => state.compositionById)
  const activeComposition = {
    get current() {
      const id = activeCompositionId.current
      return id ? compositionById.current[id] : undefined
    },
  }
  const mainHolder = select(useCompositionNavigationStore, (state) => state.mainHolder)
  const isTimelineLoading = select(useTimelineSettingsStore, (state) => state.isTimelineLoading)
  const previewProject = $derived.by(() => {
    const composition = activeComposition.current
    if (isTimelineLoading.current || !mainHolder.current || composition?.editorKind !== 'composite-2d') {
      return null
    }
    return {
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      backgroundColor: composition.backgroundColor,
      durationInFrames: composition.durationInFrames,
    }
  })
</script>

{#if !previewProject}
  <section
    class="flex min-h-0 min-w-0 flex-1 items-center justify-center bg-video-preview-background p-6"
    role="region"
    aria-label={t('editor.compose.title')}
    data-testid="motion-preview-empty"
  >
    <div class="flex max-w-sm flex-col items-center text-center">
      <div
        class="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-panel-header text-primary shadow-sm"
      >
        <Spline class="h-5 w-5" />
      </div>
      <h2 class="text-sm font-semibold text-foreground">
        {t('editor.compose.emptyTitle')}
      </h2>
      <p class="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
        {t('editor.compose.emptyDescription')}
      </p>
      <Button type="button" size="sm" class="mt-4 h-8 gap-1.5 text-xs" onclick={() => (createDialogOpen = true)}>
        <Plus class="h-3.5 w-3.5" />
        {t('editor.compose.newComposition')}
      </Button>
    </div>
  </section>
  <NewCompositionDialog
    open={createDialogOpen}
    onOpenChange={(open) => (createDialogOpen = open)}
    defaults={project}
  />
{:else}
  <PreviewArea
    project={previewProject}
    durationInFrames={previewProject.durationInFrames}
    preferProjectStoreMetadata={false}
  />
{/if}
