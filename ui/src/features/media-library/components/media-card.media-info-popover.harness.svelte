<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  // Stands in for MediaInfoPopover in media-card tests: seeks to a caption at 2.5s.
  let { onSeekToCaption }: { onSeekToCaption?: (timeSec: number) => void } = $props()
</script>

<button data-testid="media-info-popover" onclick={() => onSeekToCaption?.(2.5)}>
  Open media info
</button>
