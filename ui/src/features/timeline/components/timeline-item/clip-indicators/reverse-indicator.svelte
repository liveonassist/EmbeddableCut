<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { t } from '$lib/i18n.svelte'
  import type { ReverseConformStatus } from './types'

  let { status }: { status?: ReverseConformStatus } = $props()

  const title = $derived.by(() => {
    let title = t('timeline.clipIndicators.reversedPlayback')
    if (status === 'ready') title = t('timeline.clipIndicators.reversedPrepared')
    if (status === 'pending') title = t('timeline.clipIndicators.preparingReversed')
    if (status === 'error') title = t('timeline.clipIndicators.reversedPrepFailed')
    return title
  })
</script>

<span class="px-1 py-0.5 text-[10px] font-bold bg-black/60 text-white rounded font-mono" {title}>
  REV
</span>
