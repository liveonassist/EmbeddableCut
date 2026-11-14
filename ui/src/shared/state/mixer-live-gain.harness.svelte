<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useMixerLiveGain } from './mixer-live-gain'

  // Test probe: renders an item's live gain, and reports each time it re-runs.
  let {
    itemId,
    testId,
    onRender,
  }: { itemId: string; testId: string; onRender?: () => void } = $props()

  const gain = useMixerLiveGain(() => itemId)
  const text = $derived.by(() => {
    onRender?.()
    return String(gain.current)
  })
</script>

<div data-testid={testId}>{text}</div>
