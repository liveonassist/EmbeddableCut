<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import type { AudioEqBandView } from '../audio-eq-panel-bands'
  import type { AudioEqControlRangeId } from '../audio-eq-ui'
  import type { AudioEqFieldHandler, AudioEqPatch } from '../audio-eq-types'
  import EqBandCard from './eq-band-card.svelte'

  interface AudioEqPanelGainBandsProps {
    views: AudioEqBandView[]
    detached: boolean
    disabled: boolean
    onFieldChange: AudioEqFieldHandler
    onFieldLiveChange: AudioEqFieldHandler
    onPatchChange: (patch: AudioEqPatch) => void
    onRangeChange: (view: AudioEqBandView, rangeId: AudioEqControlRangeId) => void
    portalContainer?: HTMLElement | null
  }

  /** The six band cards, as laid out by the floating and detached panels. */
  let {
    views,
    detached,
    disabled,
    onFieldChange,
    onFieldLiveChange,
    onPatchChange,
    onRangeChange,
    portalContainer,
  }: AudioEqPanelGainBandsProps = $props()
</script>

<div
  class={cn(
    detached ? 'space-y-3 p-3' : 'space-y-2 p-2',
    disabled && 'pointer-events-none opacity-40',
  )}
>
  <div class={cn(detached && 'overflow-x-auto pb-1')}>
    <div class={cn('grid', detached ? 'min-w-[1120px] grid-cols-6 gap-2' : 'grid-cols-6 gap-1')}>
      {#each views as view (view.key)}
        <EqBandCard
          {view}
          {detached}
          {onFieldChange}
          {onFieldLiveChange}
          {onPatchChange}
          {onRangeChange}
          {portalContainer}
        />
      {/each}
    </div>
  </div>
</div>
