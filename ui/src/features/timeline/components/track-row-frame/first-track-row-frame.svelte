<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TrackRowFrameBase from './track-row-frame-base.svelte'
  import type { TrackRowFrameProps } from './types'

  let props: TrackRowFrameProps = $props()
</script>

<TrackRowFrameBase {...props} dividers="top-and-bottom" />
