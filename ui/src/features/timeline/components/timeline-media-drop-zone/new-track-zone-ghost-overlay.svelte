<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import { registerNewTrackZoneGhostOverlay } from '@/features/timeline/stores/new-track-zone-preview-store'
  import TimelineDropGhostPreviews from '../timeline-drop-ghost-previews.svelte'
  import type { TimelineDropGhostPreviewsHandle } from '../timeline-drop-ghost-previews'

  interface Props {
    zone: 'video' | 'audio'
  }

  let { zone }: Props = $props()

  let previewsHandle: TimelineDropGhostPreviewsHandle | null = null

  $effect(() => {
    const currentZone = zone
    return untrack(() => {
      const previews = previewsHandle
      const unregister = registerNewTrackZoneGhostOverlay(currentZone, {
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

<TimelineDropGhostPreviews bind:this={previewsHandle} variant="zone" />
