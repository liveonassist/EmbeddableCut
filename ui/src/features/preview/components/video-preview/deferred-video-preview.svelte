<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useRafDeferredValue } from '@/shared/hooks/use-raf-deferred-value.svelte'
  import VideoPreviewBase from './video-preview-base.svelte'
  import type { PreviewItemsSnapshot, PreviewOverlayChrome, VideoPreviewProps } from './types'

  let {
    itemsSnapshot,
    ...props
  }: VideoPreviewProps & {
    overlayChrome: PreviewOverlayChrome
    itemsSnapshot: PreviewItemsSnapshot
  } = $props()
  const deferredItemsSnapshot = useRafDeferredValue(() => itemsSnapshot)
</script>

<VideoPreviewBase {...props} itemsSnapshot={deferredItemsSnapshot.current} />
