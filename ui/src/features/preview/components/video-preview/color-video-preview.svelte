<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import VideoPreview from './video-preview.svelte'
  import type { VideoPreviewProps } from './types'

  let props: VideoPreviewProps = $props()
</script>

<VideoPreview {...props} chrome="color" />
