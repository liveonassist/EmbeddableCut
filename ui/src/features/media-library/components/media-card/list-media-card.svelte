<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import MediaCardInternal from './media-card-internal.svelte'
  import type { MediaCardProps } from './media-card-helpers'

  let props: MediaCardProps = $props()
</script>

<MediaCardInternal {...props} layout="list" />
