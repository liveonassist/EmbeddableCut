<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** Stands in for `KeyframeGraphPanel` in tests: exposes the props it was given. */
  let {
    isOpen,
    placement,
    showCloseButton,
    initialVisibleGroupIds,
    propertyColumnWidth,
  }: {
    isOpen: boolean
    placement?: string
    showCloseButton?: boolean
    initialVisibleGroupIds?: readonly string[]
    propertyColumnWidth?: number
  } = $props()
</script>

<div
  data-testid="keyframe-graph-panel"
  data-open={String(isOpen)}
  data-placement={placement}
  data-show-close={String(showCloseButton)}
  data-initial-groups={initialVisibleGroupIds?.join(',')}
  data-property-column-width={propertyColumnWidth}
></div>
