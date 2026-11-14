<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Loads/saves the render queue for the active project. Renders nothing —
   * mount once near the editor root alongside <RenderQueueRunner />.
   */
  import { useRenderQueuePersistence } from '../hooks/use-render-queue-persistence.svelte'

  let { projectId }: { projectId: string } = $props()

  useRenderQueuePersistence(() => projectId)
</script>
