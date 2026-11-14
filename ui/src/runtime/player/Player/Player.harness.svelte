<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import HeadlessPlayer from './HeadlessPlayer.svelte'
  import type { PlayerRef } from './types'

  let {
    onRef,
    durationInFrames,
    fps,
    initialFrame,
  }: {
    onRef: (ref: PlayerRef | null) => void
    durationInFrames: number
    fps: number
    initialFrame?: number
  } = $props()

  let ref = $state<PlayerRef | null>(null)
  $effect.pre(() => onRef(ref))
</script>

<HeadlessPlayer bind:ref {durationInFrames} {fps} {initialFrame}>
  <div></div>
</HeadlessPlayer>
