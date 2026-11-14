<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useVisualFreezeFrame } from './use-visual-freeze-frame.svelte'

  // Test probe: renders the frame visual derivations should use.
  let { frame }: { frame: number } = $props()

  const visualFrame = useVisualFreezeFrame(() => frame)
</script>

<div data-testid="visual-frame">{visualFrame.current}</div>
