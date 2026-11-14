<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { MotionPreviewArea, MotionTimelineDock } from '.'

  // The Motion preview and dock side by side, as the editor shell mounts them.
  let { project }: { project: { width: number; height: number; fps: number } } = $props()
</script>

<MotionPreviewArea {project} />
<MotionTimelineDock {project} />
