<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Layers from 'lucide-svelte/icons/layers'
  import Trash2 from 'lucide-svelte/icons/trash-2'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  import { cn } from '@/shared/ui/cn'
  import { useEditorStore } from '@/shared/state/editor'
  import {
    deleteCompoundClips,
    getCompoundClipDeletionImpact,
    openComposition,
    openCompositionAsTab,
    renameCompoundClip,
    useCompositionsStore,
    useCompositionNavigationStore,
    useSequencesStore,
    type SubComposition,
    wouldCreateCompositionCycle,
  } from '@/features/media-library/deps/timeline-stores'
  import { useMediaLibraryStore } from '@/features/media-library/stores/media-library-store'
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { GRID_MIN_SIZE_PX, GRID_GAP_BY_SIZE } from '../media-grid-constants'
  import CompositionCard from './composition-card.svelte'

  /**
   * Compositions section in the media library.
   * Displays all sub-compositions as reusable assets.
   * Hidden when no compositions exist.
   */

  const compositions = select(useCompositionsStore, (s) => s.compositions)
  const compositionById = select(useCompositionsStore, (s) => s.compositionById)
  const activeCompositionId = select(useCompositionNavigationStore, (s) => s.activeCompositionId)
  const topLevelSequenceIds = select(useSequencesStore, (s) => s.topLevelSequenceIds)

  const viewMode = select(useMediaLibraryStore, (s) => s.viewMode)
  const mediaItemSize = select(useMediaLibraryStore, (s) => s.mediaItemSize)
  const selectedCompositionIds = select(useMediaLibraryStore, (s) => s.selectedCompositionIds)
  const isTranscriptionDialogOpen = select(useEditorStore, (s) => s.transcriptionDialogDepth > 0)
  const selectedCompositionIdSet = $derived(new Set(selectedCompositionIds.current))
  let open = $state(true)
  let deleteTarget = $state.raw<SubComposition | null>(null)
  let editingId = $state<string | null>(null)
  let editValue = $state('')

  // Classic sequences/compound clips and layer-based compositions share the
  // render primitive but open in different editing surfaces.
  const groups = $derived.by(() => {
    const sequenceIdSet = new Set(topLevelSequenceIds.current)
    const sequences: SubComposition[] = []
    const compositeCompositions: SubComposition[] = []
    const compoundClips: SubComposition[] = []
    for (const comp of compositions.current) {
      if (comp.editorKind === 'composite-2d') compositeCompositions.push(comp)
      else if (sequenceIdSet.has(comp.id)) sequences.push(comp)
      else compoundClips.push(comp)
    }
    return { sequences, compositeCompositions, compoundClips }
  })
  const orderedCompositions = $derived([
    ...groups.sequences,
    ...groups.compositeCompositions,
    ...groups.compoundClips,
  ])
  // Only show the per-group sub-headers when both groups are populated —
  // otherwise the section header alone is enough and a lone sub-header reads
  // as redundant chrome.
  const showGroupHeaders = $derived(
    [groups.sequences, groups.compositeCompositions, groups.compoundClips].filter(
      (group) => group.length > 0,
    ).length > 1,
  )

  let renameCancelled = false
  let lastSelectedCompositionId: string | null = null

  function handleCompositionSelect(compositionId: string, event?: MouseEvent) {
    const currentCompositions = orderedCompositions
    const mediaStore = useMediaLibraryStore.getState()

    if (event?.shiftKey && lastSelectedCompositionId) {
      const lastIndex = currentCompositions.findIndex(
        (item) => item.id === lastSelectedCompositionId,
      )
      const currentIndex = currentCompositions.findIndex((item) => item.id === compositionId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const startIndex = Math.min(lastIndex, currentIndex)
        const endIndex = Math.max(lastIndex, currentIndex)
        const rangeIds = currentCompositions.slice(startIndex, endIndex + 1).map((item) => item.id)

        if (event.ctrlKey || event.metaKey) {
          mediaStore.setSelection({
            mediaIds: mediaStore.selectedMediaIds,
            compositionIds: [...new Set([...mediaStore.selectedCompositionIds, ...rangeIds])],
          })
        } else {
          mediaStore.setSelection({ mediaIds: [], compositionIds: rangeIds })
        }
        return
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      mediaStore.toggleCompositionSelection(compositionId)
      lastSelectedCompositionId = compositionId
      return
    }

    mediaStore.setSelection({ mediaIds: [], compositionIds: [compositionId] })
    lastSelectedCompositionId = compositionId
  }

  function handleConfirmDelete() {
    const target = deleteTarget
    if (!target) return
    deleteCompoundClips([target.id])
    const mediaStore = useMediaLibraryStore.getState()
    mediaStore.setSelection({
      mediaIds: mediaStore.selectedMediaIds,
      compositionIds: mediaStore.selectedCompositionIds.filter((id) => id !== target.id),
    })
    deleteTarget = null
  }

  function handleStartRename(comp: SubComposition) {
    editingId = comp.id
    editValue = comp.name
  }

  function handleCommitRename(id: string) {
    if (renameCancelled) {
      renameCancelled = false
      editingId = null
      return
    }
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== useCompositionsStore.getState().getComposition(id)?.name) {
      renameCompoundClip(id, trimmed)
    }
    editingId = null
  }

  function handleCancelRename() {
    renameCancelled = true
    editingId = null
  }

  const deleteImpact = $derived(
    deleteTarget
      ? getCompoundClipDeletionImpact([deleteTarget.id])
      : { rootReferenceCount: 0, nestedReferenceCount: 0, totalReferenceCount: 0 },
  )
  // A sequence is the same primitive as a compound clip — only the label
  // differs (top-level tab vs embed-only). Membership is stable while the
  // dialog is open, so a non-reactive read is fine.
  const isSequenceTarget = $derived(
    deleteTarget ? useSequencesStore.getState().isTopLevelSequence(deleteTarget.id) : false,
  )

  const groupContainerClass = $derived(
    viewMode.current === 'grid'
      ? `grid ${GRID_GAP_BY_SIZE[mediaItemSize.current] ?? GRID_GAP_BY_SIZE[3]}`
      : 'space-y-1',
  )
  const groupContainerStyle = $derived(
    viewMode.current === 'grid'
      ? `grid-template-columns: repeat(auto-fill, minmax(min(${GRID_MIN_SIZE_PX[mediaItemSize.current] ?? GRID_MIN_SIZE_PX[3]}px, 100%), 1fr));`
      : undefined,
  )
</script>

{#snippet groupHeader(label: string, count: number)}
  <div class="flex items-center gap-1.5 px-1 pt-1 pb-1">
    <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {label}
    </span>
    <span class="text-[10px] tabular-nums text-muted-foreground/50">{count}</span>
  </div>
{/snippet}

{#snippet group(label: string, items: SubComposition[])}
  {#if items.length > 0}
    <div>
      {#if showGroupHeaders}
        {@render groupHeader(label, items.length)}
      {/if}
      <div class={groupContainerClass} style={groupContainerStyle}>
        {#each items as comp (comp.id)}
          <CompositionCard
            composition={comp}
            layout={viewMode.current === 'grid' ? 'grid' : 'list'}
            selected={selectedCompositionIdSet.has(comp.id)}
            isTranscriptionDialogOpen={isTranscriptionDialogOpen.current}
            dragDisabled={wouldCreateCompositionCycle({
              parentCompositionId: activeCompositionId.current,
              insertedCompositionId: comp.id,
              compositionById: compositionById.current,
            })}
            isEditing={editingId === comp.id}
            {editValue}
            onEditValueChange={(value) => (editValue = value)}
            onSelect={(event) => handleCompositionSelect(comp.id, event)}
            onEnter={() => openComposition(comp.id, comp.name)}
            onOpenAsTab={() => openCompositionAsTab(comp.id)}
            canOpenAsTab={comp.editorKind !== 'composite-2d'}
            onDelete={() => (deleteTarget = comp)}
            onStartRename={() => handleStartRename(comp)}
            onCommitRename={handleCommitRename}
            onCancelRename={handleCancelRename}
          />
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#if compositions.current.length > 0}
  <Collapsible bind:open>
    <CollapsibleTrigger
      class="flex items-center gap-2 w-full py-2 hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors"
    >
      <ChevronRight
        class={cn('w-3 h-3 text-muted-foreground transition-transform', open && 'rotate-90')}
      />
      <Layers class="w-3 h-3 text-violet-400" />
      <span class="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
        {t('media.compositions.sectionTitle')}
      </span>
      <span class="text-[10px] tabular-nums text-muted-foreground">
        {compositions.current.length}
      </span>
    </CollapsibleTrigger>
    <CollapsibleContent class="pt-1 pb-2 space-y-2">
      {@render group(t('media.compositions.sequencesGroup'), groups.sequences)}
      {@render group(
        t('media.compositions.compositionsGroup', { defaultValue: 'Compositions' }),
        groups.compositeCompositions,
      )}
      {@render group(t('media.compositions.compoundClipsGroup'), groups.compoundClips)}
    </CollapsibleContent>
  </Collapsible>

  <AlertDialog bind:open={() => deleteTarget !== null, (next) => !next && (deleteTarget = null)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {t(
            isSequenceTarget
              ? 'media.compositions.deleteSequenceTitle'
              : 'media.compositions.deleteTitle',
          )}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {#snippet child({ props })}
            <div {...props} class={cn(props.class as string, 'space-y-3')}>
              <p>
                {t(
                  isSequenceTarget
                    ? 'media.compositions.deleteSequenceBody'
                    : 'media.compositions.deleteBody',
                  { name: deleteTarget?.name ?? '' },
                )}
              </p>
              {#if deleteImpact.totalReferenceCount > 0}
                <div
                  class="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md"
                >
                  <Trash2 class="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div class="text-sm text-yellow-600 dark:text-yellow-400">
                    <p class="font-medium">{t('media.compositions.deleteInstancesTitle')}</p>
                    <p class="text-xs mt-1 text-yellow-600/80 dark:text-yellow-400/80">
                      {t(
                        isSequenceTarget
                          ? 'media.compositions.deleteSequenceInstancesDetail'
                          : 'media.compositions.deleteInstancesDetail',
                        {
                          count: deleteImpact.totalReferenceCount,
                        },
                      )}
                    </p>
                  </div>
                </div>
              {/if}
            </div>
          {/snippet}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onclick={handleConfirmDelete}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {t('common.delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
{/if}
