<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useProjectStore } from '@/features/projects/stores/project-store'

  /**
   * The full editor over the SDK editor's open project, inside an editor
   * root: `editor-app.svelte` for `mountEditor`, the editor route in the app.
   */
  const project = select(useProjectStore, (s) => s.currentProject)
</script>

<div class="flex h-full w-full items-center justify-center bg-background text-sm text-muted-foreground">
  {project.current ? project.current.name : 'EmbeddableCut'}
</div>
