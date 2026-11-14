<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useRouter } from './router.svelte'
  import type { NavigateOptions } from './types'

  /** TanStack's `Navigate`: navigates once mounted, rendering nothing. */
  let { to, params, search, hash, replace }: NavigateOptions = $props()

  const router = useRouter()

  $effect(() => {
    void router.navigate({ to, params, search, hash, replace })
  })
</script>
