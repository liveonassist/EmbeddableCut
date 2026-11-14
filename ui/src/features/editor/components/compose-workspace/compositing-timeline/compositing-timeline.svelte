<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select, shallow } from '$lib/store.svelte'
  import { useRafDeferredValue } from '@/shared/hooks/use-raf-deferred-value.svelte'
  import { useGizmoStore } from '@/features/editor/deps/preview'
  import { useItemsStore } from '@/features/editor/deps/timeline-motion'
  import {
    isTranslateOnlyItemsSnapshotChange,
    resolveTranslatePresentation,
    type CompositingTimelineItemsSnapshot,
  } from '../motion-timeline-items-snapshot'
  import CompositingTimelineCore from './compositing-timeline-core.svelte'

  interface CompositingTimelineProps {
    class?: string
    defaults?: { width: number; height: number; fps: number }
  }

  let props: CompositingTimelineProps = $props()

  /**
   * Keep the mandatory external-store notification tiny. The canonical timeline
   * transform and undo entry are still committed synchronously, while the large
   * Motion tree takes the coherent item/index snapshot a frame later.
   */
  const itemsSnapshot = select(
    useItemsStore,
    (state): CompositingTimelineItemsSnapshot => ({
      items: state.items,
      tracks: state.tracks,
      itemById: state.itemById,
    }),
    shallow,
  )
  const deferredItemsSnapshot = useRafDeferredValue(() => itemsSnapshot.current)

  /**
   * Structural edits render straight away; only the one translate commit that
   * matches the current gizmo interaction is allowed to catch up a frame later,
   * so the pointer-up task never pays for the whole Motion tree.
   */
  let pendingTranslateInteraction: number | null = null
  const renderedSnapshot = $derived.by(() => {
    const current = itemsSnapshot.current
    const deferred = deferredItemsSnapshot.current
    const gizmoState = useGizmoStore.getState()
    const presentation = resolveTranslatePresentation(gizmoState.activeGizmo, gizmoState.presentationHandoff)
    const isPendingTranslateCommit =
      deferred !== current &&
      presentation !== null &&
      isTranslateOnlyItemsSnapshotChange(deferred, current, presentation.itemId)

    if (isPendingTranslateCommit) {
      pendingTranslateInteraction = presentation.interactionId
    } else if (deferred === current) {
      pendingTranslateInteraction = null
    }

    return isPendingTranslateCommit && pendingTranslateInteraction === presentation?.interactionId
      ? deferred
      : current
  })
</script>

<CompositingTimelineCore class={props.class} defaults={props.defaults} itemsSnapshot={renderedSnapshot} />
