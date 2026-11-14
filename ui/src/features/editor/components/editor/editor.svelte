<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { useProjectStore } from '@/features/editor/deps/projects'
  import LoadedEditor from './loaded-editor.svelte'
  import type { EditorProject } from './types'

  /**
   * Video Editor entrypoint, for the project the engine has open. The SDK
   * opens and closes projects (`openProject` migrates a legacy one when the
   * host allows it, `loadDocument`, `closeProject`); the editor renders
   * whatever `useProjectStore` holds, and nothing while it holds none.
   */
  const currentProject = select(useProjectStore, (s) => s.currentProject)

  const project: EditorProject | null = $derived.by(() => {
    const current = currentProject.current
    if (!current) return null
    return {
      id: current.id,
      name: current.name,
      width: current.metadata.width,
      height: current.metadata.height,
      fps: current.metadata.fps,
      backgroundColor: current.metadata.backgroundColor,
    }
  })
</script>

{#if project}
  {#key project.id}
    <LoadedEditor projectId={project.id} {project} />
  {/key}
{/if}
