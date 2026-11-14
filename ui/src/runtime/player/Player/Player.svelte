<!-- SPDX-License-Identifier: MIT -->
<!--
  Player - Main Player Component for FreeCut

  Uses the Clock system internally for timing control, with:
  - Frame-accurate playback
  - Custom controls
  - Fullscreen mode
  - Event emission for external integration
-->
<script lang="ts">
  import { PlayerEmitterProvider } from '../event-emitter'
  import { ClockBridgeProvider } from '../clock'
  import { VideoConfigProvider } from '../video-config-context'
  import PlayerInner from './PlayerInner.svelte'
  import type { PlayerProps } from './types'

  let { ref = $bindable(null), ...props }: PlayerProps = $props()
</script>

<PlayerEmitterProvider>
  <ClockBridgeProvider
    fps={props.fps}
    durationInFrames={props.durationInFrames}
    initialFrame={props.initialFrame}
    initiallyMuted={props.initiallyMuted}
    initialPlaybackRate={props.playbackRate}
    loop={props.loop}
    onEnded={props.onEnded}
    onVolumeChange={() => {}}
  >
    <VideoConfigProvider
      fps={props.fps}
      width={props.width ?? 1280}
      height={props.height ?? 720}
      durationInFrames={props.durationInFrames}
    >
      <PlayerInner {...props} bind:ref />
    </VideoConfigProvider>
  </ClockBridgeProvider>
</PlayerEmitterProvider>
