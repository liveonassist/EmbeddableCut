<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Stands in for `AppEyedropperOverlay` in tests: resolves a fixed colour on
   * mount, so the panel's real hex→rgb→param conversion still runs.
   */
  let { onResolve }: { onResolve: (hex: string | null) => void } = $props()

  $effect(() => onResolve('#808080'))
</script>
