<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { layoutTestState } from './layout-section.test-state'

  /** Stands in for `KeyframeToggle` in the layout-section test; counts prop updates. */
  let props: {
    itemIds: string[]
    property: string
    currentValue: number
    getCurrentValue?: () => number
  } = $props()

  $effect.pre(() => {
    void [props.itemIds, props.property, props.currentValue, props.getCurrentValue]
    layoutTestState.keyframeUpdateCounts[props.property] =
      (layoutTestState.keyframeUpdateCounts[props.property] ?? 0) + 1
  })
</script>

<!-- svelte-ignore a11y_consider_explicit_label -->
<button type="button" aria-label={`keyframe-${props.property}`}></button>
