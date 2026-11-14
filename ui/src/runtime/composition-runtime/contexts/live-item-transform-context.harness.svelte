<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" generics="T">
  import type { LiveItemTransformSource } from './live-item-transform-context.svelte'
  import LiveItemTransformProvider from './live-item-transform-provider.svelte'
  import Probe from './live-item-transform-context.probe.svelte'

  let {
    source,
    hook,
    onValue,
  }: {
    source: LiveItemTransformSource
    hook: () => { readonly current: T }
    onValue: (value: T) => void
  } = $props()
</script>

<LiveItemTransformProvider {source}>
  <Probe {hook} {onValue} />
</LiveItemTransformProvider>
