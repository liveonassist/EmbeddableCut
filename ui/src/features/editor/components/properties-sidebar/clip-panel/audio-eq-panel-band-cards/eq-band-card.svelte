<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { AudioEqBandView } from '../audio-eq-panel-bands'
  import type { AudioEqControlRangeId, AudioEqFilterType } from '../audio-eq-ui'
  import type { AudioEqFieldHandler, AudioEqPatch } from '../audio-eq-types'
  import { BandCard } from '../audio-eq-panel-controls'
  import EqBandBody from './eq-band-body.svelte'
  import EqBandFrequencyFields from './eq-band-frequency-fields.svelte'

  interface EqBandCardProps {
    view: AudioEqBandView
    /** Detached layout stretches the cards; the floating one packs them. */
    detached: boolean
    onFieldChange: AudioEqFieldHandler
    onFieldLiveChange: AudioEqFieldHandler
    onPatchChange: (patch: AudioEqPatch) => void
    onRangeChange: (view: AudioEqBandView, rangeId: AudioEqControlRangeId) => void
    portalContainer?: HTMLElement | null
  }

  /** One band card: frequency row, then the band body. */
  let {
    view,
    detached,
    onFieldChange,
    onFieldLiveChange,
    onPatchChange,
    onRangeChange,
    portalContainer,
  }: EqBandCardProps = $props()
</script>

<BandCard
  title={view.title}
  filterType={view.type}
  filterOptions={view.filterOptions}
  onFilterTypeChange={(value: AudioEqFilterType) =>
    onFieldChange(view.typeField, view.coerceFilterType(value))}
  {portalContainer}
  compact={!detached}
  active={view.enabled}
  onToggle={() => onFieldChange(view.enabledField, !view.enabled)}
  onReset={() => onPatchChange(view.resetPatch)}
>
  <EqBandFrequencyFields {view} {onFieldChange} {onFieldLiveChange} />
  <EqBandBody {view} {onFieldChange} {onFieldLiveChange} {onRangeChange} />
</BandCard>
