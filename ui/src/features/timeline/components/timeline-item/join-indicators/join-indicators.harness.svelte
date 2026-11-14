<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TimelineJoinIndicatorsZoomGate, ZoomGatedJoinIndicators } from './index'

  const indicatorProps = {
    hasJoinableLeft: true,
    hasJoinableRight: true,
    trackLocked: false,
    dragAffectsJoin: { left: false, right: false },
    hoveredEdge: null,
    isTrimming: false,
    isStretching: false,
    isBeingDragged: false,
  } as const
</script>

<TimelineJoinIndicatorsZoomGate>
  <ZoomGatedJoinIndicators {...indicatorProps} />
</TimelineJoinIndicatorsZoomGate>
