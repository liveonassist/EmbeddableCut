<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { setSequenceContext } from '@/runtime/player/composition/sequence-context'

  // Test stand-in for Sequence: always mounted, at local frame 0.
  let {
    from,
    durationInFrames,
    children,
  }: { from: number; durationInFrames: number; children: Snippet } = $props()

  setSequenceContext(untrack(() => ({ from, durationInFrames, localFrame: 0, parentFrom: 0 })))
</script>

<div data-sequence-from={from} data-sequence-duration={durationInFrames}>
  {@render children()}
</div>
