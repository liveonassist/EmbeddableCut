<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `ColorGradeSection` in tests. */
  let { layout, onCreateAdjustmentLayer }: { layout?: string; onCreateAdjustmentLayer?: () => void } =
    $props()
</script>

<div data-testid="color-grade-section" data-layout={layout}>
  {onCreateAdjustmentLayer ? 'has adjustment action' : null}
</div>
