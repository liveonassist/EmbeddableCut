<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useTrackHeightResize } from './use-track-height-resize.svelte'

  const { handleTrackResizeStart, handleTrackResizeReset } = useTrackHeightResize()
</script>

<button type="button" onmousedown={(event) => handleTrackResizeStart(event, 'v1')}>
  Resize V1
</button>
<button type="button" ondblclick={(event) => handleTrackResizeReset(event, 'v1')}>
  Reset V1
</button>
