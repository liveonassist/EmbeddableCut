<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `KeyframeToggle` in tests: exposes the property it was given. */
  let { property }: { property: string } = $props()
</script>

<!-- svelte-ignore a11y_consider_explicit_label -->
<button type="button" data-testid="keyframe-toggle" data-property={property}></button>
