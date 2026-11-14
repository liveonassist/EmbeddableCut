<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import type { ResolvedAudioEqSettings } from '@/types/audio'
  import AudioEqCurveEditor from './audio-eq-curve-editor.svelte'
  import type { AudioEqFieldHandler, AudioEqPatch } from './audio-eq-types'
  import { EqOutputGainControl } from './audio-eq-panel-controls'

  interface AudioEqPanelGraphProps {
    settings: ResolvedAudioEqSettings
    outputGainDb: number | 'mixed'
    disabled: boolean
    /** Detached panels stretch the curve graph, floating ones keep it compact. */
    detached: boolean
    compact: boolean
    /** Track panels do not show the selected-clip count badge. */
    trackMode: boolean
    clipCount: number
    onPatchLiveChange: (patch: AudioEqPatch) => void
    onPatchChange: (patch: AudioEqPatch) => void
    onFieldChange: AudioEqFieldHandler
  }

  /** Curve editor plus the output-gain fader sitting next to it. */
  let {
    settings,
    outputGainDb,
    disabled,
    detached,
    compact,
    trackMode,
    clipCount,
    onPatchLiveChange,
    onPatchChange,
    onFieldChange,
  }: AudioEqPanelGraphProps = $props()
</script>

<div class={cn('relative', !compact && 'border-b border-border')}>
  {#if !trackMode && !compact}
    <div
      class="pointer-events-none absolute right-3 top-1 z-10 text-[10px] uppercase tracking-[0.16em] text-zinc-500"
    >
      {clipCount}
      {clipCount === 1 ? 'clip' : 'clips'}
    </div>
  {/if}
  <div class="flex items-stretch gap-3 px-3 pb-3 pt-2">
    <div class="min-w-0 flex-1">
      <AudioEqCurveEditor
        {settings}
        {disabled}
        class="text-zinc-300"
        graphClass={cn('bg-background', detached ? 'h-[clamp(288px,33vh,344px)]' : 'h-[220px]')}
        onLiveChange={onPatchLiveChange}
        onChange={onPatchChange}
      />
    </div>
    {#if !compact}
      <EqOutputGainControl
        value={outputGainDb}
        {disabled}
        compact={!detached}
        onLiveChange={(value) => onPatchLiveChange({ audioEqOutputGainDb: value })}
        onChange={(value) => onFieldChange('audioEqOutputGainDb', value)}
      />
    {/if}
  </div>
</div>
