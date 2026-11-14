<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import InlineSourcePreviewContent from './inline-source-preview/inline-source-preview-content.svelte'

  interface InlineSourcePreviewProps {
    mediaId: string
    seekFrame: number | null
    containerSize: {
      width: number
      height: number
    }
  }

  let { mediaId, seekFrame, containerSize }: InlineSourcePreviewProps = $props()
</script>

{#key mediaId}
  <InlineSourcePreviewContent
    mediaId={mediaId}
    seekFrame={seekFrame}
    containerSize={containerSize}
   />
{/key}
