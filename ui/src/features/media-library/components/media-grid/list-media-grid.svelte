<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MediaGridBase from './media-grid-base.svelte'
  import type { MediaGridProps } from './types'

  let props: MediaGridProps = $props()
</script>

<MediaGridBase {...props} layout="list" />
