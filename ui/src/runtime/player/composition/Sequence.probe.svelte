<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useSequenceContext } from './sequence-context'

  // Test probe: reports the local frame each time its reader re-runs.
  let { onFrame }: { onFrame: (localFrame: number) => void } = $props()

  const sequence = useSequenceContext()
  $effect.pre(() => onFrame(sequence?.localFrame ?? Number.NaN))
</script>
