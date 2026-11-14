<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `SliderInput` in tests: shows its raw value. */
  let { value }: { value: number | 'mixed' } = $props()
</script>

<div data-testid="slider-input">{String(value)}</div>
