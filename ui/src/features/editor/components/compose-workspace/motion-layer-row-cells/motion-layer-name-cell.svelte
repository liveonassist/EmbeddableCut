<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import type { Icon as LucideIconComponent } from 'lucide-svelte'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import EllipsisVertical from 'lucide-svelte/icons/ellipsis-vertical'
  import Eye from 'lucide-svelte/icons/eye'
  import EyeOff from 'lucide-svelte/icons/eye-off'
  import Lock from 'lucide-svelte/icons/lock'
  import Unlock from 'lucide-svelte/icons/lock-open'
  import { cn } from '@/shared/ui/cn'
  import type { TimelineItem, TimelineTrack } from '@/types/timeline'
  import type { LayerEntry } from '../motion-layer-row-model'
  import type { MotionLayerSelectionCommands } from '../motion-layer-selection'
  import type { MotionRowReorderCommands } from '../motion-row-reorder'
  import type { RenameTarget } from '../motion-timeline-primitives'
  import LayerRenameInput from './layer-rename-input.svelte'
  import { getLockToggleLabels } from './helpers'

  interface MotionLayerNameCellProps {
    item: TimelineItem
    index: number
    depth: number
    track: TimelineTrack | undefined
    LayerTypeIcon: typeof LucideIconComponent
    activeCompositionId: string
    layerEntries: readonly LayerEntry[]
    expanded: boolean
    hasVisibleChildProperties: boolean
    isLayerLocked: boolean
    isParentLayerGroupLocked: boolean
    nullObjectNonRenderingLabel: string | undefined
    renameTarget: RenameTarget | null
    renameDraft: string
    t: TFunction
    rowReorder: MotionRowReorderCommands
    layerSelection: MotionLayerSelectionCommands
    updateLayerTrack: (trackId: string, updates: Partial<TimelineTrack>) => void
    setAllTracksLocked: (locked: boolean) => void
    toggleLayerExpanded: (compositionId: string, itemId: string) => void
    setAllLayersExpanded: (compositionId: string, itemIds: Iterable<string>, expanded: boolean) => void
    beginRename: (target: RenameTarget, name: string) => void
    commitRename: () => void
    setRenameDraft: (value: string) => void
    setRenameTarget: (target: RenameTarget | null) => void
  }

  /** Reorder handle, expand toggle, per-track toggles and the layer name. */
  let {
    item,
    index,
    depth,
    track,
    LayerTypeIcon,
    activeCompositionId,
    layerEntries,
    expanded,
    hasVisibleChildProperties,
    isLayerLocked,
    isParentLayerGroupLocked,
    nullObjectNonRenderingLabel,
    renameTarget,
    renameDraft,
    t,
    rowReorder,
    layerSelection,
    updateLayerTrack,
    setAllTracksLocked,
    toggleLayerExpanded,
    setAllLayersExpanded,
    beginRename,
    commitRename,
    setRenameDraft,
    setRenameTarget,
  }: MotionLayerNameCellProps = $props()

  const lockLabels = $derived(getLockToggleLabels(t, isParentLayerGroupLocked, isLayerLocked))
</script>

<div
  data-testid="motion-layer-name-cell-{item.id}"
  class="flex min-w-0 flex-1 items-center gap-1 px-1.5"
  style:padding-left="{6 + depth * 16}px"
>
  {#if track}
    <button
      type="button"
      data-testid="motion-reorder-handle-{track.id}"
      disabled={isLayerLocked}
      onpointerdown={(event) => !isLayerLocked && rowReorder.begin(event, track)}
      onpointermove={rowReorder.move}
      onpointerup={rowReorder.end}
      onpointercancel={rowReorder.cancel}
      class="flex h-6 w-3.5 shrink-0 touch-none items-center justify-center rounded-sm text-muted-foreground/65 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary active:text-primary"
      title={t('editor.compose.reorderLayer')}
      aria-label={t('editor.compose.reorderLayer')}
    >
      <EllipsisVertical class="h-4 w-4" />
    </button>
  {/if}
  {#if hasVisibleChildProperties}
    <button
      type="button"
      onclick={(event) => {
        if (event.shiftKey) {
          setAllLayersExpanded(
            activeCompositionId,
            layerEntries.map((entry) => entry.item.id),
            !expanded,
          )
          return
        }
        toggleLayerExpanded(activeCompositionId, item.id)
      }}
      class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      title={t('editor.compose.shiftToggleAllLayers', {
        defaultValue: 'Shift-click to expand or collapse all layers',
      })}
      aria-label={expanded
        ? t('editor.compose.collapseLayerProperties')
        : t('editor.compose.expandLayerProperties')}
    >
      {#if expanded}
        <ChevronDown class="h-3.5 w-3.5" />
      {:else}
        <ChevronRight class="h-3.5 w-3.5" />
      {/if}
    </button>
  {:else}
    <span class="h-[18px] w-[18px] shrink-0" aria-hidden="true"></span>
  {/if}

  <!-- Eye toggle, or the null-object placeholder that keeps controller rows aligned. -->
  {#if item.type === 'controller'}
    <span
      class="h-[18px] w-[18px] shrink-0"
      data-testid="motion-null-object-icon-slot-{item.id}"
      aria-hidden="true"
    ></span>
  {:else}
    <button
      type="button"
      onclick={() => track && updateLayerTrack(track.id, { visible: !track.visible })}
      class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label={track?.visible === false ? t('editor.compose.showLayer') : t('editor.compose.hideLayer')}
    >
      {#if track?.visible === false}
        <EyeOff class="h-3.5 w-3.5" />
      {:else}
        <Eye class="h-3.5 w-3.5" />
      {/if}
    </button>
  {/if}

  <!-- Lock toggle; shift-click applies the row's next state to every track. -->
  <button
    type="button"
    onclick={(event) => {
      if (!track || isParentLayerGroupLocked) return
      if (event.shiftKey) {
        setAllTracksLocked(!track.locked)
        return
      }
      updateLayerTrack(track.id, { locked: !track.locked })
    }}
    disabled={isParentLayerGroupLocked}
    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
    aria-label={lockLabels.label}
    title={lockLabels.title}
  >
    {#if isLayerLocked}
      <Lock class="h-3.5 w-3.5" />
    {:else}
      <Unlock class="h-3.5 w-3.5" />
    {/if}
  </button>

  <!-- Solo toggle, or the placeholder that keeps controller rows aligned. -->
  {#if item.type === 'controller'}
    <span class="h-5 w-5 shrink-0" aria-hidden="true"></span>
  {:else}
    <button
      type="button"
      onclick={() => track && updateLayerTrack(track.id, { solo: !track.solo })}
      class={cn(
        'h-5 w-5 rounded text-[9px] font-bold',
        track?.solo ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
      aria-label={track?.solo ? t('editor.compose.disableSolo') : t('editor.compose.soloLayer')}
    >
      S
    </button>
  {/if}

  <!-- The layer name: an inline rename input while renaming, a select button otherwise. -->
  {#if renameTarget?.kind === 'layer' && renameTarget.id === item.id}
    <LayerRenameInput
      value={renameDraft}
      ariaLabel="Layer name"
      onDraftChange={setRenameDraft}
      onCommit={commitRename}
      onCancel={() => setRenameTarget(null)}
    />
  {:else}
    <button
      type="button"
      onclick={(event) =>
        layerSelection.selectLayer(item.id, {
          toggle: event.metaKey || event.ctrlKey,
          range: event.shiftKey,
        })}
      ondblclick={() => beginRename({ kind: 'layer', id: item.id }, item.label || item.type)}
      class="min-w-0 flex-1 truncate px-0 text-left text-[11px] font-medium text-foreground"
      title={nullObjectNonRenderingLabel ?? (item.label || item.type)}
      aria-label={nullObjectNonRenderingLabel ? `${index + 1}. ${nullObjectNonRenderingLabel}` : undefined}
    >
      <span
        class="mr-0.5 inline-block w-3 shrink-0 text-right text-[9px] tabular-nums text-muted-foreground/70"
        >{index + 1}</span
      ><LayerTypeIcon
        class="mr-1 inline-block h-3 w-3 shrink-0 align-[-2px] text-muted-foreground"
        data-testid="motion-layer-type-icon-{item.id}"
        data-motion-layer-type-icon={item.type}
        aria-hidden="true"
      />{item.label || item.type}
    </button>
  {/if}
</div>
