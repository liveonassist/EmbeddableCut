<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Film from '@lucide/svelte/icons/film'
  import MoreVertical from '@lucide/svelte/icons/ellipsis-vertical'
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '@/shared/ui/cn'
  import { select } from '$lib/store.svelte'
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu'
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
  import { useSequencesStore } from '@/features/timeline/stores/sequences-store'
  import { useCompositionsStore } from '@/features/timeline/stores/compositions-store'
  import {
    useCompositionNavigationStore,
    getActiveTabId,
  } from '@/features/timeline/stores/composition-navigation-store'
  import {
    closeSequenceTab,
    createSequence,
    deleteCompoundClips,
    renameCompoundClip,
  } from '@/features/timeline/stores/actions/composition-actions'

  /**
   * Standalone-timeline tab strip (multi-timeline). Lists the Main timeline plus
   * every top-level sequence; clicking switches which sequence is live. A
   * sequence is the same primitive as a compound clip — see sequences-store.
   */
  const topLevelSequenceIds = select(useSequencesStore, (s) => s.topLevelSequenceIds)
  const compositionById = select(useCompositionsStore, (s) => s.compositionById)
  const breadcrumbs = select(useCompositionNavigationStore, (s) => s.breadcrumbs)
  const switchToSequence = select(useCompositionNavigationStore, (s) => s.switchToSequence)
  const activeTabId = $derived(getActiveTabId(breadcrumbs.current))

  let editingId = $state<string | null>(null)
  let draftName = $state('')
  let cancelled = false
  let deleteTarget = $state<{ id: string; name: string } | null>(null)

  function beginRename(id: string, currentName: string) {
    cancelled = false
    draftName = currentName
    editingId = id
  }

  function commitRename(id: string) {
    // Escape sets the cancel guard; the unmount-triggered blur must not commit.
    if (cancelled) {
      cancelled = false
      editingId = null
      return
    }
    renameCompoundClip(id, draftName)
    editingId = null
  }

  // Only render tabs whose composition still exists (guards against dangling ids
  // e.g. after an undone create-sequence).
  const tabs = $derived(
    topLevelSequenceIds.current
      .map((id) => compositionById.current[id])
      .filter((comp): comp is NonNullable<typeof comp> => Boolean(comp)),
  )

  // Main is the active tab whenever the breadcrumb root is Main — including when
  // drilled into a compound clip from Main (that's the Main lineage, not a tab).
  const isMainActive = $derived(activeTabId === null)

  function handleRenameKeyDown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename(id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelled = true
      ;(e.target as HTMLInputElement).blur()
    }
    e.stopPropagation()
  }
</script>

<div
  class="flex items-center gap-1 px-2 py-1 border-b border-border bg-background/60 backdrop-blur-sm text-xs overflow-x-auto"
>
  <button
    type="button"
    onclick={() => switchToSequence.current(null)}
    class={cn(
      'flex items-center gap-1.5 rounded-md px-2.5 py-1 whitespace-nowrap transition-colors cursor-pointer',
      isMainActive
        ? 'bg-accent text-foreground font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
    )}
  >
    <Film class="h-3 w-3" />
    Main
  </button>

  {#each tabs as comp (comp.id)}
    {@const isActive = activeTabId === comp.id}
    {@const isEditing = editingId === comp.id}
    <div
      class={cn(
        'group flex items-center gap-1 rounded-md pl-2.5 pr-1 py-1 whitespace-nowrap transition-colors',
        isActive
          ? 'bg-accent text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
      )}
    >
      {#if isEditing}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          autofocus
          value={draftName}
          oninput={(e) => (draftName = e.currentTarget.value)}
          onblur={() => commitRename(comp.id)}
          onkeydown={(e) => handleRenameKeyDown(e, comp.id)}
          class="w-24 bg-transparent outline-none border-b border-border"
        />
      {:else}
        <button
          type="button"
          onclick={() => switchToSequence.current(comp.id)}
          ondblclick={() => beginRename(comp.id, comp.name)}
          class="cursor-pointer max-w-[10rem] truncate"
          title={comp.name}
        >
          {comp.name}
        </button>
      {/if}

      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              aria-label="Sequence options"
              class="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 rounded p-0.5 hover:bg-accent transition-opacity cursor-pointer"
            >
              <MoreVertical class="h-3 w-3" />
            </button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="text-xs">
          <DropdownMenuItem onSelect={() => beginRename(comp.id, comp.name)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => closeSequenceTab(comp.id)}>Close tab</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            class="text-destructive focus:text-destructive"
            onSelect={() => (deleteTarget = { id: comp.id, name: comp.name })}
          >
            Delete sequence
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        aria-label="Close tab"
        onclick={() => closeSequenceTab(comp.id)}
        class="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-accent transition-opacity cursor-pointer"
      >
        <X class="h-3 w-3" />
      </button>
    </div>
  {/each}

  <button
    type="button"
    aria-label="New sequence"
    data-tooltip="New sequence"
    onclick={() => createSequence()}
    class="ml-0.5 flex items-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
  >
    <Plus class="h-3.5 w-3.5" />
  </button>

  <AlertDialog
    bind:open={
      () => deleteTarget !== null,
      (o) => {
        if (!o) deleteTarget = null
      }
    }
  >
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete sequence</AlertDialogTitle>
        <AlertDialogDescription>
          Delete sequence &ldquo;{deleteTarget?.name}&rdquo;? Any clips that reference it will also
          be removed. This can be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          onclick={() => {
            if (deleteTarget) deleteCompoundClips([deleteTarget.id])
            deleteTarget = null
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</div>
