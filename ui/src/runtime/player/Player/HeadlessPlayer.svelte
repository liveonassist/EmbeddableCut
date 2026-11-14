<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Player from './Player.svelte'
  import type { PlayerProps } from './types'

  let { ref = $bindable(null), ...props }: Omit<PlayerProps, 'controls'> = $props()
</script>

<Player {...props} bind:ref controls={false} />
