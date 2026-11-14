<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { untrack } from 'svelte'
  import type { Clock } from '@/runtime/player/clock/Clock'
  import { useClock } from './ClockContext'

  // Test probe: hands the surrounding provider's clock to the test.
  let { onClock }: { onClock: (clock: Clock) => void } = $props()

  const clock = useClock()
  untrack(() => onClock(clock))
</script>
