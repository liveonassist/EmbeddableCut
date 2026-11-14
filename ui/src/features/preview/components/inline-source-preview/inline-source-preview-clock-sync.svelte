<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useClock } from '@/features/preview/deps/player-context'

  let { frame }: { frame: number | null } = $props()
  const clock = useClock()

  $effect(() => {
    clock.seekToFrame(frame ?? 0)
  })
</script>
