<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Info from '@lucide/svelte/icons/info'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import TransitionCard from './transition-card.svelte'
  import {
    addTransition,
    updateTransition,
    useItemsStore,
    useTimelineSettingsStore,
    useTransitionsStore,
  } from '@/features/editor/deps/timeline-store'
  import { useSelectionStore } from '@/shared/state/selection'
  import { resolveTransitionTargetFromSelection } from '@/features/editor/deps/timeline-utils'
  import type { WipeDirection, SlideDirection, FlipDirection } from '@/types/transition'
  import { TRANSITION_DRAG_MIME, useTransitionDragStore } from '@/shared/state/transition-drag'
  import {
    TRANSITION_CATEGORY_INFO,
    TRANSITION_CATEGORY_ORDER,
    getTransitionPresentationConfigs,
    getTransitionConfigsByCategory,
    getTransitionCategoryStartIndices,
  } from '@/features/editor/utils/transition-ui-config'

  const items = select(useItemsStore, (s) => s.items)
  const transitions = select(useTransitionsStore, (s) => s.transitions)
  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  // Get selection
  const selectedItemIds = select(useSelectionStore, (s) => s.selectedItemIds)
  const selectionCount = $derived(selectedItemIds.current.length)
  const selectedId = $derived(selectionCount === 1 ? selectedItemIds.current[0] : null)

  const adjacentInfo = $derived.by(() => {
    if (!selectedId) return null
    return resolveTransitionTargetFromSelection({
      selectedItemIds: [selectedId],
      items: items.current,
      transitions: transitions.current,
      timelineFps: fps.current,
    })
  })

  function handleDragStart(event: DragEvent, configIndex: number) {
    const config = getTransitionPresentationConfigs()[configIndex]
    if (!config || !event.dataTransfer) return

    const dragDescriptor = {
      presentation: config.id,
      direction: (config.direction ?? config.defaultDirection) as
        | WipeDirection
        | SlideDirection
        | FlipDirection
        | undefined,
    }

    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(TRANSITION_DRAG_MIME, JSON.stringify(dragDescriptor))
    const { setDraggedTransition, setInvalidHint } = useTransitionDragStore.getState()
    setDraggedTransition(dragDescriptor)
    setInvalidHint(null)
  }

  function handleDragEnd() {
    useTransitionDragStore.getState().clearDrag()
  }

  // Apply a transition by config index
  function handleApplyByIndex(configIndex: number) {
    const config = getTransitionPresentationConfigs()[configIndex]
    if (!config) return

    // Get fresh state at click time
    const { items: currentItems } = useItemsStore.getState()
    const { transitions: currentTransitions } = useTransitionsStore.getState()
    const { fps: currentFps } = useTimelineSettingsStore.getState()
    const currentSelectedIds = useSelectionStore.getState().selectedItemIds
    const info = resolveTransitionTargetFromSelection({
      selectedItemIds: currentSelectedIds,
      items: currentItems,
      transitions: currentTransitions,
      timelineFps: currentFps,
    })

    if (!info || (!info.hasExisting && !info.canApply)) return

    const { leftClipId, rightClipId, hasExisting, existingTransitionId } = info
    const presentation = config.id
    const direction = (config.direction ?? config.defaultDirection) as
      | WipeDirection
      | SlideDirection
      | FlipDirection
      | undefined

    if (hasExisting && existingTransitionId) {
      updateTransition(existingTransitionId, { presentation, direction })
    } else {
      addTransition(
        leftClipId,
        rightClipId,
        'crossfade',
        info.suggestedDurationInFrames,
        presentation,
        direction,
      )
    }
  }

  const hasValidClickTarget = $derived(
    !!adjacentInfo && (adjacentInfo.hasExisting || adjacentInfo.canApply),
  )
</script>

<div class="h-full flex flex-col">
  <!-- Info banner -->
  <div class="px-3 py-2 border-b border-border bg-secondary/30">
    <div class="flex items-start gap-2 text-xs">
      <Info class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div class="text-muted-foreground leading-relaxed">
        {#if hasValidClickTarget}
          <span class="text-primary">{t('editor.transitions.hintClickToApply')}</span>
        {:else if adjacentInfo?.reason}
          <span>{t('editor.transitions.hintUnavailable', { reason: adjacentInfo.reason })}</span>
        {:else if selectionCount === 1}
          <span>{t('editor.transitions.hintSelectOne')}</span>
        {:else if selectionCount > 1}
          <span>{t('editor.transitions.hintSelectSingle')}</span>
        {:else}
          <span>{t('editor.transitions.hintSelectClip')}</span>
        {/if}
      </div>
    </div>
  </div>

  <!-- Transitions grid by category -->
  <div class="flex-1 overflow-y-auto p-3 space-y-4">
    {#each TRANSITION_CATEGORY_ORDER as category (category)}
      {@const configs = getTransitionConfigsByCategory()[category]}
      {#if configs && configs.length > 0}
        {@const info = TRANSITION_CATEGORY_INFO[category]}
        {@const startIndex = getTransitionCategoryStartIndices()[category]!}
        <div class="space-y-2">
          <div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {info ? t(info.titleKey) : category}
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            {#each configs as config, index (`${config.id}-${config.direction || index}`)}
              <TransitionCard
                {config}
                configIndex={startIndex + index}
                onApply={handleApplyByIndex}
                clickDisabled={!hasValidClickTarget}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </div>
</div>
