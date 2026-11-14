<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import ErrorBoundary from '@/components/error-boundary.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import {
    repairCompositeCompositionEditorialLeak,
    useCompositionNavigationStore,
    useCompositionsStore,
    useTimelineSettingsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useEditorStore } from '@/shared/state/editor'
  import { CompositingTimeline } from '../compositing-timeline'
  import { useComposeUiStore } from '../compose-ui-store'
  import { getMotionReturnTabAtMount, restoreMotionReturnTimeline, type MotionWorkspaceProject } from './shared'

  /**
   * Motion owns only the bottom dock. It captures the outgoing editorial tab so
   * Edit, Color, and Animate return to the exact sequence the user left.
   */
  let { project }: { project: MotionWorkspaceProject } = $props()

  const returnTabId = getMotionReturnTabAtMount()
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
  const compositions = select(useCompositionsStore, (state) => state.compositions)
  const motionCompositions = $derived(
    compositions.current.filter((composition) => composition.editorKind === 'composite-2d'),
  )
  const lastOpenedCompositionId = select(useComposeUiStore, (state) => state.lastOpenedCompositionId)

  $effect.pre(() => {
    useComposeUiStore.getState().captureMotionReturnTab(returnTabId)
    const unsubscribeWorkspace = useEditorStore.subscribe((state, previousState) => {
      if (previousState.workspace === 'motion' && state.workspace !== 'motion') {
        // Zustand subscriptions run synchronously. Restore the editorial stores
        // before the destination workspace's classic timeline renders.
        restoreMotionReturnTimeline()
      }
    })
    return () => {
      unsubscribeWorkspace()
      // Fallback for teardown paths that bypass the normal workspace setter.
      if (useEditorStore.getState().workspace !== 'motion') {
        restoreMotionReturnTimeline()
      }
    }
  })

  $effect(() => {
    usePlaybackStore.getState().pause()
  })

  $effect(() => {
    const composition = activeComposition.current
    const compositionId = activeCompositionId.current
    const holder = mainHolder.current
    if (composition?.editorKind !== 'composite-2d' || !compositionId) return
    if (holder) {
      const wrapper = holder.items.find((item) => item.compositionId === compositionId)
      repairCompositeCompositionEditorialLeak({
        compositionId,
        editorialItemIds: holder.items.map((item) => item.id),
        suggestedDurationInFrames: wrapper ? (wrapper.sourceDuration ?? wrapper.durationInFrames) : undefined,
      })
    }
    useComposeUiStore.getState().setLastOpenedCompositionId(compositionId)
  })

  $effect(() => {
    // On refresh the persisted workspace can mount Motion before Main has
    // finished hydrating. Opening a composition during that window lets the
    // root loader write editorial items into the composition's live stores.
    // Wait until hydration is fully complete before restoring the last comp.
    const composition = activeComposition.current
    const holder = mainHolder.current
    const candidates = motionCompositions
    const lastOpened = lastOpenedCompositionId.current
    if (isTimelineLoading.current) return
    if (useEditorStore.getState().workspace !== 'motion') return
    if (composition?.editorKind === 'composite-2d' && holder) return
    const target = candidates.find((candidate) => candidate.id === lastOpened) ?? candidates[0]
    if (target) {
      useCompositionNavigationStore.getState().switchToSequence(target.id)
    }
  })
</script>

<!-- Never mount the Motion timeline against root/editorial stores. During an
     F5 it intentionally stays empty for a frame, then mounts only after the
     hydrated Motion composition has become the active runtime context. -->
{#if isTimelineLoading.current || !mainHolder.current || activeComposition.current?.editorKind !== 'composite-2d'}
  <div class="h-full bg-background" data-testid="motion-timeline-empty"></div>
{:else}
  <ErrorBoundary level="feature">
    <CompositingTimeline class="h-full" defaults={project} />
  </ErrorBoundary>
{/if}
