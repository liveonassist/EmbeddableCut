<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import CompoundPropertyInputs from './compound-property-inputs.svelte'
  import type { CompoundPropertyInputConfig } from './compound-property-inputs'

  // Test probe: reports each time the owner of `config` re-runs its template.
  let { config, onRender }: { config: CompoundPropertyInputConfig; onRender: () => void } =
    $props()

  const ownerConfig = $derived.by(() => {
    onRender()
    return config
  })
</script>

<CompoundPropertyInputs config={ownerConfig} />
