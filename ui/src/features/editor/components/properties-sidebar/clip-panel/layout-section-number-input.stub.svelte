<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `NumberInput` in the layout-section test: shows its value. */
  let { label, value }: { label?: string; value: number | 'mixed' } = $props()
</script>

<input readonly aria-label={`number-${label}`} {value} />
