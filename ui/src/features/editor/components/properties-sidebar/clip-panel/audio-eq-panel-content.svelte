<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import type { AudioEqSettings } from '@/types/audio'
  import type { AudioEqPatch } from './audio-eq-curve-editor/types'

  interface Props {
    targetLabel: string
    items?: TimelineItem[]
    trackEq?: AudioEqSettings
    enabled?: boolean
    onTrackEqChange?: (patch: AudioEqPatch) => void
    onEnabledChange?: (enabled: boolean) => void
    portalContainer?: HTMLElement | null
    layoutMode?: 'floating' | 'detached' | 'compact'
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
