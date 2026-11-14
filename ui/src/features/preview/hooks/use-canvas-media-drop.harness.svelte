<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useCanvasMediaDrop } from './use-canvas-media-drop.svelte'

  const drop = useCanvasMediaDrop(() => ({
    coordParams: {} as never,
    projectSize: { width: 1280, height: 720 },
  }))
</script>

<div data-testid="drop-target" role="presentation" ondrop={drop.handleDrop}></div>
