<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Stands in for PreviewArea in compose-layout.test.ts: shows what it was handed.
  let {
    project,
    durationInFrames,
    preferProjectStoreMetadata,
  }: {
    project: { width: number; height: number; fps: number; backgroundColor?: string }
    durationInFrames?: number
    preferProjectStoreMetadata?: boolean
  } = $props()
</script>

<div
  data-testid="preview-area"
  data-background-color={project.backgroundColor}
  data-duration-in-frames={durationInFrames}
  data-prefer-project-store-metadata={String(preferProjectStoreMetadata)}
>
  {project.width}x{project.height}@{project.fps}
</div>
