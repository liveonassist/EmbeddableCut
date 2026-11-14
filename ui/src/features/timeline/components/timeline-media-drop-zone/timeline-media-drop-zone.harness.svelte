<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TimelineMediaDropZone from './timeline-media-drop-zone.svelte'

  interface Props {
    height: number
    zone: 'video' | 'audio'
    anchorTrackId: string
  }

  let { height, zone, anchorTrackId }: Props = $props()
</script>

<div class="timeline-container">
  <TimelineMediaDropZone {height} {zone} {anchorTrackId} />
</div>
