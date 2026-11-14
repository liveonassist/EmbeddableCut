<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AbsoluteFill } from '@/features/preview/deps/player-core'

  let { src }: { src: string } = $props()
</script>

<AbsoluteFill>
  <img
    src={src}
    style:width="100%"
    style:height="100%"
    style:object-fit="contain"
    alt="Source preview"
   />
</AbsoluteFill>
