<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import { VideoConfigProvider } from '@/runtime/composition-runtime/deps/player'
  import type { LiveItemTransformSource } from '../../contexts/live-item-transform-context.svelte'
  import LiveItemTransformProvider from '../../contexts/live-item-transform-provider.svelte'
  import SequenceFrame from './use-item-visual-state.sequence.harness.svelte'
  import { KeyframesProvider } from '../../contexts/keyframes-context'
  import Probe from './use-item-visual-state.probe.svelte'

  // Test harness: the probe at frame 0 of a 1920×1080 sequence under keyframes
  // (and optionally a live transform source).
  let {
    id,
    liveSource,
    ...probe
  }: ComponentProps<typeof Probe> & { id: string; liveSource?: LiveItemTransformSource } =
    $props()
  const canvas = { width: 1920, height: 1080, fps: 30 }
</script>

<VideoConfigProvider {id} width={canvas.width} height={canvas.height} fps={canvas.fps} durationInFrames={120}>
  <SequenceFrame>
    <LiveItemTransformProvider source={liveSource}>
      <KeyframesProvider keyframes={probe.keyframes} items={probe.items} {canvas}>
        <Probe {...probe} />
      </KeyframesProvider>
    </LiveItemTransformProvider>
  </SequenceFrame>
</VideoConfigProvider>
