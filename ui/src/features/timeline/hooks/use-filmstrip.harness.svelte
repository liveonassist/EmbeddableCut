<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useFilmstrip } from './use-filmstrip.svelte'

  let { mediaId, isVisible }: { mediaId: string; isVisible: boolean } = $props()

  useFilmstrip(() => ({
    mediaId,
    blobUrl: 'blob:test',
    duration: 10,
    isVisible,
    enabled: true,
  }))
</script>
