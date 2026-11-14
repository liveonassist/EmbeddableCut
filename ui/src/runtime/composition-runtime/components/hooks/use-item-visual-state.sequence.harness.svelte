<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setSequenceContext } from '@/runtime/composition-runtime/deps/player'

  // Test harness: a fixed sequence context at frame 0.
  let { children }: { children: Snippet } = $props()

  setSequenceContext({ from: 0, parentFrom: 0, localFrame: 0, durationInFrames: 120 })
</script>

{@render children()}
