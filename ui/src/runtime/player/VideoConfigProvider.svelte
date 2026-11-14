<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { setVideoConfig } from './video-config'

  let {
    children,
    fps,
    width,
    height,
    durationInFrames,
    id = 'player',
  }: {
    children: Snippet
    fps: number
    width: number
    height: number
    durationInFrames: number
    id?: string
  } = $props()

  setVideoConfig({
    get fps() {
      return fps
    },
    get width() {
      return width
    },
    get height() {
      return height
    },
    get durationInFrames() {
      return durationInFrames
    },
    get id() {
      return id
    },
  })
</script>

{@render children()}
