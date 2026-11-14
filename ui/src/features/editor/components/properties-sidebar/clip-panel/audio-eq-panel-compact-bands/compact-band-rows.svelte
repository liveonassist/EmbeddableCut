<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import { NumberInput } from '../../components'
  import { FilterTypeSelect } from '../audio-eq-panel-controls'
  import { bandShowsGain, bandShowsQ, type AudioEqBandView } from '../audio-eq-panel-bands'
  import type { AudioEqFieldHandler } from '../audio-eq-types'
  import CompactGainCell from './compact-gain-cell.svelte'
  import CompactQCell from './compact-q-cell.svelte'

  interface CompactBandRowsProps {
    views: AudioEqBandView[]
    disabled: boolean
    onFieldChange: AudioEqFieldHandler
    onFieldLiveChange: AudioEqFieldHandler
    portalContainer?: HTMLElement | null
  }

  /** Six bands as aligned rows of toggle, filter type, frequency, gain and Q. */
  let {
    views,
    disabled,
    onFieldChange,
    onFieldLiveChange,
    portalContainer,
  }: CompactBandRowsProps = $props()

  const anyGain = $derived(views.some((view) => bandShowsGain(view.type)))
  const anyQ = $derived(views.some((view) => bandShowsQ(view.type)))
</script>

<div class={cn(disabled && 'pointer-events-none opacity-40')}>
  <div class="space-y-1 px-2 pb-2">
    <div class="grid grid-cols-6 gap-1">
      {#each views as view (view.key)}
        <button
          type="button"
          onclick={() => onFieldChange(view.enabledField, !view.enabled)}
          class={cn(
            'h-7 rounded-[4px] border text-[11px] font-semibold transition-colors',
            view.enabled
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-secondary/50 text-muted-foreground hover:bg-secondary',
          )}
        >
          {view.label}
        </button>
      {/each}
    </div>
    <div class="grid grid-cols-6 gap-1">
      {#each views as view (view.key)}
        <FilterTypeSelect
          value={view.type}
          options={view.filterOptions}
          onChange={(value) => onFieldChange(view.typeField, view.coerceFilterType(value))}
          {portalContainer}
        />
      {/each}
    </div>
    <div class="grid grid-cols-6 gap-1">
      {#each views as view (view.key)}
        <NumberInput
          value={view.frequencyHz}
          onChange={(value) => onFieldChange(view.frequencyField, value)}
          onLiveChange={(value) => onFieldLiveChange(view.frequencyField, value)}
          unit="Hz"
          min={view.minFrequencyHz}
          max={view.maxFrequencyHz}
          step={1}
        />
      {/each}
    </div>
    {#if anyGain}
      <div class="grid grid-cols-6 gap-1">
        {#each views as view (view.key)}
          <CompactGainCell {view} {onFieldChange} {onFieldLiveChange} />
        {/each}
      </div>
    {/if}
    {#if anyQ}
      <div class="grid grid-cols-6 gap-1">
        {#each views as view (view.key)}
          <CompactQCell {view} {onFieldChange} {onFieldLiveChange} />
        {/each}
      </div>
    {/if}
  </div>
</div>
