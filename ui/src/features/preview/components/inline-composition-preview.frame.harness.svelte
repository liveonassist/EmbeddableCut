<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { InlineCompositionPreview } from './inline-composition-preview'

  // A frame panel whose parent re-renders it with a new seek frame or size, the
  // way an edit overlay does: the constant props stay constant (testing-library's
  // `rerender` would replace every prop at once).
  let {
    seekFrame,
    containerSize,
  }: { seekFrame: number; containerSize: { width: number; height: number } } = $props()
</script>

<InlineCompositionPreview
  compositionId="composition-1"
  {seekFrame}
  {containerSize}
  presentation="frame"
/>
