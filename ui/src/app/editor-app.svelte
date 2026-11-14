<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { EditorUi } from '$lib/context'
  import { select } from '$lib/store.svelte'
  import { useProjectStore } from '@/features/projects/stores/project-store'
  import EditorRoot from './editor-root.svelte'

  /** The full editor, as `mountEditor` mounts it. */
  let { ui }: { ui: EditorUi } = $props()

  const project = select(useProjectStore, (s) => s.currentProject)
</script>

<EditorRoot {ui}>
  <div class="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
    {project.current ? project.current.name : 'EmbeddableCut'}
  </div>
</EditorRoot>
