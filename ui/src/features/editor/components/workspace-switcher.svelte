<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import Layers from 'lucide-svelte/icons/layers'
  import Palette from 'lucide-svelte/icons/palette'
  import Scissors from 'lucide-svelte/icons/scissors'
  import type { EditorWorkspaceId } from '@/config/editor-workspaces'

  const WORKSPACE_ITEMS: readonly {
    id: EditorWorkspaceId
    icon: typeof Scissors
    labelKey: string
  }[] = [
    { id: 'edit', icon: Scissors, labelKey: 'toolbar.workspaces.edit' },
    { id: 'color', icon: Palette, labelKey: 'toolbar.workspaces.color' },
    { id: 'motion', icon: Layers, labelKey: 'toolbar.workspaces.motion' },
  ]
</script>

<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { t } from '$lib/i18n.svelte'
  import { useEditorStore } from '@/shared/state/editor'
  import { cn } from '@/shared/ui/cn'

  /**
   * DaVinci-style workspace tabs. Switching applies a panel layout preset
   * (scopes, inspector tab, sidebar tab, timeline split) without touching
   * selection, playhead, or project state.
   */
  const workspace = select(useEditorStore, (s) => s.workspace)
</script>

<div
  role="tablist"
  aria-label={t('toolbar.workspaces.label')}
  class="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
>
  {#each WORKSPACE_ITEMS as { id, icon: Icon, labelKey } (id)}
    {@const isActive = workspace.current === id}
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onclick={() => useEditorStore.getState().setWorkspace(id)}
      class={cn(
        'flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium transition-colors',
        isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon class="h-3.5 w-3.5" />
      {t(labelKey)}
    </button>
  {/each}
</div>
