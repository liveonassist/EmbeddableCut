<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" generics="T">
  import { untrack } from 'svelte'

  // Test probe: calls a hook during init and reports its value every time a reader re-runs.
  let {
    hook,
    onValue,
  }: { hook: () => { readonly current: T }; onValue: (value: T) => void } = $props()

  const result = untrack(() => hook())
  $effect.pre(() => {
    const value = result.current
    untrack(() => onValue(value))
  })
</script>
