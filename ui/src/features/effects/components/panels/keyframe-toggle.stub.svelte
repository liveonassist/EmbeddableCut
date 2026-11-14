<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `KeyframeToggle` in tests: a button named after its property. */
  let { property }: { property: string } = $props()
</script>

<button type="button" aria-label={`Keyframe ${property}`}></button>
