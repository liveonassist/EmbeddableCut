<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import ClockBridgeProvider from './ClockBridgeProvider.svelte'
  import Probe from './clock-bridge-context.probe.svelte'

  let props: ComponentProps<typeof Probe> = $props()
</script>

<ClockBridgeProvider fps={30} durationInFrames={200}>
  <Probe {...props} />
</ClockBridgeProvider>
