<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Layers from '@lucide/svelte/icons/layers'
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
  } from '@/components/ui/context-menu'
  import { cn } from '@/shared/ui/cn'
  import { useEditorStore } from '@/shared/state/editor'
  import {
    useCompositionsStore,
    type SubComposition,
  } from '@/features/media-library/deps/timeline-stores'
  import { setMediaDragData, clearMediaDragData } from '@/features/media-library/utils/drag-data-cache'
  import { compoundClipThumbnailService } from '@/features/media-library/services/compound-clip-thumbnail-service'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { CARD_GRID_BASE, CARD_LIST_BASE, CARD_PERF_STYLE } from '../card-styles'

  interface CompositionCardProps {
    composition: SubComposition
    layout: 'grid' | 'list'
    selected: boolean
    isTranscriptionDialogOpen: boolean
    dragDisabled: boolean
    isEditing: boolean
    editValue: string
    onEditValueChange: (value: string) => void
    onSelect: (event: MouseEvent) => void
    onEnter: () => void
    onOpenAsTab: () => void
    canOpenAsTab: boolean
    onDelete: () => void
    onStartRename: () => void
    onCommitRename: (id: string) => void
    onCancelRename: () => void
  }

  function getSkimIndicatorStyle(progress: number): string {
    if (progress >= 0.999) {
      return 'right: 0px;'
    }

    return `left: ${progress * 100}%;`
  }

  let {
    composition,
    layout,
    selected,
    isTranscriptionDialogOpen,
    dragDisabled,
    isEditing,
    editValue,
    onEditValueChange,
    onSelect,
    onEnter,
    onOpenAsTab,
    canOpenAsTab,
    onDelete,
    onStartRename,
    onCommitRename,
    onCancelRename,
  }: CompositionCardProps = $props()

  let input = $state<HTMLInputElement | null>(null)
  let thumbnailContainer = $state<HTMLDivElement | null>(null)
  let thumbnailUrl = $state<string | null>(null)
  let skimProgress = $state<number | null>(null)
  let skimRaf: number | null = null
  let pendingSkimClientX: number | null = null
  const thisComposition = select(useCompositionsStore, (s) => s.compositionById[composition.id])

  $effect(() => {
    if (isEditing && input) {
      input.focus()
      input.select()
    }
  })

  $effect(() => {
    const compositionId = composition.id
    // Reload the thumbnail whenever the composition itself changes.
    void thisComposition.current
    let mounted = true

    const loadThumbnail = async () => {
      const url = await compoundClipThumbnailService.getThumbnailBlobUrl(compositionId)
      if (mounted) {
        thumbnailUrl = url
      }
    }

    void loadThumbnail()

    return () => {
      mounted = false
      if (useEditorStore.getState().compoundClipSkimPreviewCompositionId === compositionId) {
        useEditorStore.getState().clearCompoundClipSkimPreview()
      }
    }
  })

  function handleDragStart(e: DragEvent) {
    if (dragDisabled) {
      e.preventDefault()
      return
    }
    const data = {
      type: 'composition' as const,
      compositionId: composition.id,
      name: composition.name,
      durationInFrames: composition.durationInFrames,
      width: composition.width,
      height: composition.height,
    }
    e.dataTransfer?.setData('application/json', JSON.stringify(data))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
    setMediaDragData(data)
  }

  function handleDragEnd() {
    clearMediaDragData()
  }

  function handleDoubleClick() {
    onEnter()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      onCommitRename(composition.id)
    } else if (e.key === 'Escape') {
      onCancelRename()
    }
  }

  function handleClick(e: MouseEvent) {
    if (isEditing) return
    onSelect(e)
  }

  const canHoverPreview = $derived(composition.durationInFrames > 0 && !isTranscriptionDialogOpen)

  function updateSkimPreview(clientX: number) {
    if (!thumbnailContainer || !canHoverPreview) return

    const rect = thumbnailContainer.getBoundingClientRect()
    if (rect.width <= 0) return

    const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const frame = Math.min(
      composition.durationInFrames - 1,
      Math.max(0, Math.round(progress * Math.max(0, composition.durationInFrames - 1))),
    )

    skimProgress = progress
    useEditorStore.getState().setCompoundClipSkimPreview(composition.id, frame)
  }

  function handleThumbnailPointerEnter(event: PointerEvent) {
    if (!canHoverPreview || event.pointerType === 'touch') return
    updateSkimPreview(event.clientX)
  }

  function flushScheduledSkimPreview() {
    skimRaf = null
    const clientX = pendingSkimClientX
    pendingSkimClientX = null
    if (clientX === null) return
    updateSkimPreview(clientX)
  }

  function scheduleSkimPreview(clientX: number) {
    pendingSkimClientX = clientX
    if (skimRaf !== null) return
    skimRaf = requestAnimationFrame(flushScheduledSkimPreview)
  }

  function cancelScheduledSkimPreview() {
    pendingSkimClientX = null
    if (skimRaf !== null) {
      cancelAnimationFrame(skimRaf)
      skimRaf = null
    }
  }

  function handleThumbnailPointerMove(event: PointerEvent) {
    if (!canHoverPreview || event.pointerType === 'touch') return
    scheduleSkimPreview(event.clientX)
  }

  function handleThumbnailPointerLeave() {
    if (!canHoverPreview) return
    cancelScheduledSkimPreview()
    skimProgress = null
    useEditorStore.getState().clearCompoundClipSkimPreview()
  }

  $effect(() => () => {
    cancelScheduledSkimPreview()
  })

  const itemCount = $derived(composition.items.length)
  const durationLabel = $derived.by(() => {
    const fps = composition.fps || 30
    const durationSecs = composition.durationInFrames / fps
    return durationSecs < 60
      ? `${durationSecs.toFixed(1)}s`
      : `${Math.floor(durationSecs / 60)}:${String(Math.floor(durationSecs % 60)).padStart(2, '0')}`
  })
</script>

{#snippet renameInput(textClass: string)}
  <input
    bind:this={input}
    value={editValue}
    oninput={(e) => onEditValueChange(e.currentTarget.value)}
    onblur={() => onCommitRename(composition.id)}
    onkeydown={handleKeyDown}
    class="w-full bg-transparent border border-primary rounded px-1 py-0.5 {textClass} text-foreground outline-none"
  />
{/snippet}

{#snippet skimIndicator()}
  {#if skimProgress !== null}
    <div
      class="absolute inset-y-0 w-px bg-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none"
      style={getSkimIndicatorStyle(skimProgress)}
    ></div>
  {/if}
{/snippet}

<ContextMenu>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      {#if layout === 'grid'}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          {...props}
          data-composition-id={composition.id}
          draggable={!dragDisabled && !isEditing}
          ondragstart={handleDragStart}
          ondragend={handleDragEnd}
          onclick={handleClick}
          ondblclick={handleDoubleClick}
          style={CARD_PERF_STYLE}
          class={cn(
            CARD_GRID_BASE,
            dragDisabled
              ? 'opacity-50 cursor-not-allowed border-border'
              : cn(
                  'cursor-grab',
                  selected
                    ? 'border-violet-500 ring-2 ring-violet-500/20 shadow-lg shadow-violet-500/10'
                    : 'border-border hover:border-violet-500/50 hover:shadow-lg hover:shadow-violet-500/10',
                ),
          )}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={thumbnailContainer}
            class="flex-1 bg-secondary relative overflow-hidden min-h-0 flex items-center justify-center bg-gradient-to-br from-violet-600/20 to-violet-900/30"
            onpointerenter={handleThumbnailPointerEnter}
            onpointermove={handleThumbnailPointerMove}
            onpointerleave={handleThumbnailPointerLeave}
          >
            {#if thumbnailUrl}
              <img
                src={thumbnailUrl}
                alt={composition.name}
                class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
              />
            {:else}
              <Layers class="w-8 h-8 text-violet-400/70" />
            {/if}

            <div
              class="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-between gap-1 pointer-events-none"
            >
              <div class="p-0.5 rounded bg-violet-600/90 text-white">
                <Layers class="w-2.5 h-2.5" />
              </div>
              <div
                class="px-1 py-0.5 bg-black/70 border border-white/20 rounded text-[8px] font-mono text-white"
              >
                {durationLabel}
              </div>
            </div>
            {@render skimIndicator()}
          </div>

          <div class="px-1.5 py-1 bg-panel-bg/50 flex-shrink-0">
            <div class="flex items-center justify-between gap-1">
              <div class="flex-1 min-w-0">
                {#if isEditing}
                  {@render renameInput('text-[10px]')}
                {:else}
                  <h3
                    class="text-[10px] font-medium text-foreground truncate group-hover:text-violet-400 transition-colors"
                  >
                    {composition.name}
                  </h3>
                {/if}
              </div>
            </div>
          </div>

          <div
            class="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50"
          ></div>
          <div
            class="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-border via-muted to-border opacity-50"
          ></div>
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div
          {...props}
          data-composition-id={composition.id}
          draggable={!dragDisabled && !isEditing}
          ondragstart={handleDragStart}
          ondragend={handleDragEnd}
          onclick={handleClick}
          ondblclick={handleDoubleClick}
          style={CARD_PERF_STYLE}
          class={cn(
            CARD_LIST_BASE,
            dragDisabled
              ? 'opacity-50 cursor-not-allowed border-border'
              : cn(
                  'cursor-grab',
                  selected
                    ? 'border-violet-500 ring-1 ring-violet-500/20'
                    : 'border-border hover:border-violet-500/50',
                ),
          )}
        >
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            bind:this={thumbnailContainer}
            class="w-16 h-12 bg-secondary rounded overflow-hidden flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-violet-600/20 to-violet-900/30 relative"
            onpointerenter={handleThumbnailPointerEnter}
            onpointermove={handleThumbnailPointerMove}
            onpointerleave={handleThumbnailPointerLeave}
          >
            {#if thumbnailUrl}
              <img src={thumbnailUrl} alt={composition.name} class="w-full h-full object-contain" />
            {:else}
              <Layers class="w-5 h-5 text-violet-400" />
            {/if}
            {@render skimIndicator()}
          </div>

          <div class="flex-1 min-w-0">
            {#if isEditing}
              {@render renameInput('text-xs')}
            {:else}
              <h3 class="text-xs font-medium text-foreground truncate">{composition.name}</h3>
            {/if}
            <div class="flex items-center gap-2 mt-0.5">
              <div class="p-0.5 rounded bg-violet-600/90 text-white flex-shrink-0">
                <Layers class="w-2.5 h-2.5" />
              </div>
              <span class="text-[10px] text-muted-foreground">
                {durationLabel} &middot; {t('media.compositions.itemCount', { count: itemCount })}
              </span>
            </div>
          </div>
        </div>
      {/if}
    {/snippet}
  </ContextMenuTrigger>

  <ContextMenuContent>
    <ContextMenuItem onSelect={onEnter}>{t('media.compositions.enter')}</ContextMenuItem>
    {#if canOpenAsTab}
      <ContextMenuItem onSelect={onOpenAsTab}>
        {t('media.compositions.openAsTab')}
      </ContextMenuItem>
    {/if}
    <ContextMenuItem onSelect={onStartRename}>{t('media.compositions.rename')}</ContextMenuItem>
    <ContextMenuItem onSelect={onDelete} class="text-destructive focus:text-destructive">
      {t('common.delete')}
    </ContextMenuItem>
  </ContextMenuContent>
</ContextMenu>
