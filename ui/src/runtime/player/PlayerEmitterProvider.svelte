<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack, type Snippet } from 'svelte'
  import { PlayerEmitter } from '@/runtime/player/player-emitter'
  import { setPlayerEmitter } from './player-emitter-context'

  let { children, emitter: providedEmitter }: { children: Snippet; emitter?: PlayerEmitter } =
    $props()

  setPlayerEmitter(untrack(() => providedEmitter ?? new PlayerEmitter()))
</script>

{@render children()}
