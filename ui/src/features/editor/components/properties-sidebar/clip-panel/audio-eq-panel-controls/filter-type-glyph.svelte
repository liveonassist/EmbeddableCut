<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { AUDIO_EQ_FILTER_TYPE_PATHS } from '../audio-eq-ui'
  import type { FilterType } from './types'

  let { type }: { type: FilterType } = $props()
</script>

<svg viewBox="0 0 20 12" class="h-3 w-5 text-current">
  <path
    d={AUDIO_EQ_FILTER_TYPE_PATHS[type]}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  />
</svg>
