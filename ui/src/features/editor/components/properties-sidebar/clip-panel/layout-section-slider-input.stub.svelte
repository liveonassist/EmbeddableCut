<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `SliderInput` in the layout-section test: shows its value. */
  let { value }: { value: number | 'mixed' } = $props()
</script>

<input readonly aria-label="rotation" {value} />
