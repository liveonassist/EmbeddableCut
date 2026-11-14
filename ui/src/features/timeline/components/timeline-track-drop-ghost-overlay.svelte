<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { registerTrackDropGhostOverlay } from '@/features/timeline/stores/track-drop-preview-store'
  import TimelineDropGhostPreviews from './timeline-drop-ghost-previews.svelte'
  import type { TimelineDropGhostPreviewsHandle } from './timeline-drop-ghost-previews'

  interface Props {
    trackId: string
  }

  let { trackId }: Props = $props()

  let previewsHandle = $state<TimelineDropGhostPreviewsHandle | null>(null)

  $effect(() => {
    const currentTrackId = trackId
    return untrack(() => {
      const previews = previewsHandle
      const unregister = registerTrackDropGhostOverlay(currentTrackId, {
        sync: (ghostPreviews) => previews?.sync(ghostPreviews),
        clear: () => previews?.clear(),
      })

      return () => {
        unregister()
        previews?.clear()
      }
    })
  })
</script>

<TimelineDropGhostPreviews bind:this={previewsHandle} variant="track" />
