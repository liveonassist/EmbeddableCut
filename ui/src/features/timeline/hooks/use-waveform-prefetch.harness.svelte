<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useWaveformPrefetch } from './use-waveform-prefetch.svelte'

  let { onRender }: { onRender: () => void } = $props()

  useWaveformPrefetch()

  // Runs again only if the hook made the host depend on reactive state.
  $effect(() => {
    onRender()
  })
</script>
