<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { InlineCompositionPreview } from './inline-composition-preview'

  // Sibling frame panels, as an edit overlay's OUT/IN pair renders them.
  let { seekFrames }: { seekFrames: number[] } = $props()
</script>

{#each seekFrames as seekFrame, index (index)}
  <InlineCompositionPreview
    compositionId="composition-1"
    {seekFrame}
    containerSize={{ width: 320, height: 180 }}
    presentation="frame"
  />
{/each}
