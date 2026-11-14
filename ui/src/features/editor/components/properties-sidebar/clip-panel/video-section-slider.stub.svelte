<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `SliderInput` in tests: exposes its range maximum. */
  let { max }: { max: number } = $props()
</script>

<output data-testid="slider-input" data-max={max}></output>
