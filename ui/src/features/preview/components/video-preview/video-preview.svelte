<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useTransformStableItemsSnapshot } from '../../hooks/use-transform-stable-items-snapshot.svelte'
  import DeferredVideoPreview from './deferred-video-preview.svelte'
  import type { VideoPreviewProps } from './types'

  let { chrome = 'edit', ...previewProps }: VideoPreviewProps = $props()
  const itemsSnapshot = useTransformStableItemsSnapshot()
</script>

<DeferredVideoPreview {...previewProps} overlayChrome={chrome} itemsSnapshot={itemsSnapshot.current} />
