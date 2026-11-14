<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Clock } from '@/runtime/player/clock/Clock'
  import { ClockBridgeProvider } from '../clock'
  import ClockProbe from '../clock/clock-probe.harness.svelte'
  import Sequence from './Sequence.svelte'
  import SequenceProbe from './Sequence.probe.svelte'

  let {
    onClock,
    onFrame,
  }: { onClock: (clock: Clock) => void; onFrame: (localFrame: number) => void } = $props()
</script>

<ClockBridgeProvider fps={30} durationInFrames={200}>
  <ClockProbe {onClock} />
  <Sequence from={100} durationInFrames={20} premountFor={25}>
    <SequenceProbe {onFrame} />
  </Sequence>
</ClockBridgeProvider>
