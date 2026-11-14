<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { playerHandle } from './headless-player.mock-state'

  let {
    children,
    ref = $bindable(null),
  }: { children?: Snippet; ref?: unknown } & Record<string, unknown> = $props()

  ref = {
    seekTo: (frame: number) => playerHandle.seekTo(frame),
  }
</script>

<div>
  {@render children?.()}
</div>
