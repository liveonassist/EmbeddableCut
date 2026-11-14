<!-- SPDX-License-Identifier: MIT -->
<!-- Stands in for TimelineTrack: a row with a live-geometry content layer, counting its mounts. -->
<script lang="ts">
  import { createTimelineTrackContentLayerRef } from '@/features/timeline/utils/timeline-live-geometry'
  import { trackStubMounts } from './timeline-content.test-state'

  let { track }: { track: { id: string; height: number } } = $props()

  trackStubMounts.count += 1
  const contentLayerRef = createTimelineTrackContentLayerRef()
  const attachContentLayer = (node: HTMLDivElement) => {
    contentLayerRef(node)
    return () => contentLayerRef(null)
  }
</script>

<div data-track-id={track.id} style:height="{track.height}px">
  <div {@attach attachContentLayer} data-timeline-track-content-layer></div>
</div>
