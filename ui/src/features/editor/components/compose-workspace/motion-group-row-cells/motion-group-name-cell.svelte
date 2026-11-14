<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TFunction } from 'i18next'
  import ChevronDown from 'lucide-svelte/icons/chevron-down'
  import ChevronRight from 'lucide-svelte/icons/chevron-right'
  import EllipsisVertical from 'lucide-svelte/icons/ellipsis-vertical'
  import Eye from 'lucide-svelte/icons/eye'
  import EyeOff from 'lucide-svelte/icons/eye-off'
  import Lock from 'lucide-svelte/icons/lock'
  import Unlock from 'lucide-svelte/icons/lock-open'
  import Ungroup from 'lucide-svelte/icons/ungroup'
  import { cn } from '@/shared/ui/cn'
  import type { TimelineTrack } from '@/types/timeline'
  import { LayerRenameInput } from '../motion-layer-row-cells'
  import type { MotionRowReorderCommands } from '../motion-row-reorder'
  import { LAYER_COLUMN_WIDTH, type RenameTarget } from '../motion-timeline-primitives'

  /**
   * A group row looks like a layer row but acts on the tracks under it, so it has
   * its own toggles: the labels and the shift-click scope differ from a layer's
   * even though the markup matches.
   */
  interface MotionGroupNameCellProps {
    track: TimelineTrack
    layerCount: number
    groupItemIds: string[]
    renameTarget: RenameTarget | null
    renameDraft: string
    t: TFunction
    rowReorder: MotionRowReorderCommands
    updateLayerTrack: (trackId: string, updates: Partial<TimelineTrack>) => void
    setAllTracksLocked: (locked: boolean) => void
    selectGroupItems: (itemIds: string[]) => void
    ungroup: (trackId: string) => void
    beginRename: (target: RenameTarget, name: string) => void
    commitRename: () => void
    setRenameDraft: (value: string) => void
    setRenameTarget: (target: RenameTarget | null) => void
  }

  /** Reorder handle, group toggles, inline rename and ungroup for one layer group. */
  let {
    track,
    layerCount,
    groupItemIds,
    renameTarget,
    renameDraft,
    t,
    rowReorder,
    updateLayerTrack,
    setAllTracksLocked,
    selectGroupItems,
    ungroup,
    beginRename,
    commitRename,
    setRenameDraft,
    setRenameTarget,
  }: MotionGroupNameCellProps = $props()

  const lockLabel = $derived(
    track.locked ? t('editor.compose.unlockGroup') : t('editor.compose.lockGroup'),
  )
</script>

<div class="flex shrink-0 items-center gap-1 border-r border-border px-1.5" style:width="{LAYER_COLUMN_WIDTH}px">
  <button
    type="button"
    data-testid="motion-reorder-handle-{track.id}"
    onpointerdown={(event) => rowReorder.begin(event, track)}
    onpointermove={rowReorder.move}
    onpointerup={rowReorder.end}
    onpointercancel={rowReorder.cancel}
    class="flex h-6 w-3.5 shrink-0 touch-none items-center justify-center rounded-sm text-muted-foreground/65 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary active:text-primary"
    title={t('editor.compose.reorderGroup')}
    aria-label={t('editor.compose.reorderGroup')}
  >
    <EllipsisVertical class="h-4 w-4" />
  </button>
  <!-- Collapses the group's child rows without touching the group's own row. -->
  <button
    type="button"
    onclick={() => updateLayerTrack(track.id, { isCollapsed: !track.isCollapsed })}
    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    aria-label={track.isCollapsed ? t('editor.compose.expandGroup') : t('editor.compose.collapseGroup')}
  >
    {#if track.isCollapsed}
      <ChevronRight class="h-3.5 w-3.5" />
    {:else}
      <ChevronDown class="h-3.5 w-3.5" />
    {/if}
  </button>
  <button
    type="button"
    onclick={() => updateLayerTrack(track.id, { visible: !track.visible })}
    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    aria-label={track.visible === false ? t('editor.compose.showGroup') : t('editor.compose.hideGroup')}
  >
    {#if track.visible === false}
      <EyeOff class="h-3.5 w-3.5" />
    {:else}
      <Eye class="h-3.5 w-3.5" />
    {/if}
  </button>
  <!-- Lock toggle; shift-click applies the group's next lock state to every track. -->
  <button
    type="button"
    onclick={(event) => {
      if (event.shiftKey) {
        setAllTracksLocked(!track.locked)
        return
      }
      updateLayerTrack(track.id, { locked: !track.locked })
    }}
    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    aria-label={lockLabel}
    title="{lockLabel} — {t('editor.compose.lockAllLayersHint')}"
  >
    {#if track.locked}
      <Lock class="h-3.5 w-3.5" />
    {:else}
      <Unlock class="h-3.5 w-3.5" />
    {/if}
  </button>
  <button
    type="button"
    onclick={() => updateLayerTrack(track.id, { solo: !track.solo })}
    class={cn(
      'h-5 w-5 rounded text-[9px] font-bold',
      track.solo ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )}
    aria-label={track.solo ? t('editor.compose.disableSolo') : t('editor.compose.soloGroup')}
  >
    S
  </button>
  {#if renameTarget?.kind === 'group' && renameTarget.id === track.id}
    <LayerRenameInput
      value={renameDraft}
      ariaLabel={t('editor.compose.layerGroupName')}
      bold
      onDraftChange={setRenameDraft}
      onCommit={commitRename}
      onCancel={() => setRenameTarget(null)}
    />
  {:else}
    <button
      type="button"
      onclick={() => selectGroupItems(groupItemIds)}
      ondblclick={() => beginRename({ kind: 'group', id: track.id }, track.name)}
      class="min-w-0 flex-1 truncate px-1 text-left text-[11px] font-semibold text-foreground"
      title={track.name}
    >
      {track.name}<span class="ml-1.5 text-[9px] font-normal text-muted-foreground"
        >{t('editor.compose.groupLayerCount', { count: layerCount })}</span
      >
    </button>
  {/if}
  <button
    type="button"
    onclick={() => ungroup(track.id)}
    class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
    title={t('editor.compose.ungroup')}
    aria-label={t('editor.compose.ungroup')}
  >
    <Ungroup class="h-3.5 w-3.5" />
  </button>
</div>
