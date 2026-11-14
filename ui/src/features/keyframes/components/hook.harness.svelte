<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Test host for a hook: `setup` runs while the component initializes, so the
  // hook's effects live (and clean up) with this component; `onSetup`
  // receives what it returned.
  let {
    setup,
    onSetup,
  }: { setup: () => unknown; onSetup?: (result: unknown) => void } = $props()

  // svelte-ignore state_referenced_locally
  onSetup?.(setup())
</script>
