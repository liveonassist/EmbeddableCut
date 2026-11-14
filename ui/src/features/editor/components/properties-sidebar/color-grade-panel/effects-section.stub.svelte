<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `EffectsSection` in tests. */
  let { layout }: { layout?: string } = $props()
</script>

<div data-testid="effects-section" data-layout={layout}>Add Effect</div>
