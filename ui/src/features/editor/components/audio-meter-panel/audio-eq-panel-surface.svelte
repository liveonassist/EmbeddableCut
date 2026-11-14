<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { AudioEqSettings } from '@/types/audio'
  import type { AudioEqPatch } from '../properties-sidebar/clip-panel/audio-eq-types'

  interface AudioEqPanelSurfaceProps {
    targetLabel: string
    trackEq?: AudioEqSettings
    enabled: boolean
    onTrackEqChange?: (patch: AudioEqPatch) => void
    onEnabledChange?: (enabled: boolean) => void
    layoutMode?: 'floating' | 'detached'
  }

  let {
    targetLabel,
    trackEq,
    enabled,
    onTrackEqChange,
    onEnabledChange,
    layoutMode = 'floating',
  }: AudioEqPanelSurfaceProps = $props()

  let root = $state<HTMLDivElement | null>(null)
  // Popovers inside the EQ portal into the window the surface renders in.
  const portalContainer = $derived(root?.ownerDocument.body ?? null)

  // Loaded on first use; a loader in the script lets static analysis see the import.
  const loadAudioEqPanelContent = () => import('../properties-sidebar/clip-panel/audio-eq-panel-content.svelte')
</script>

<div bind:this={root} class="bg-background text-foreground">
  {#await loadAudioEqPanelContent() then { default: AudioEqPanelContent }}
    <AudioEqPanelContent
      {targetLabel}
      {trackEq}
      {enabled}
      {onTrackEqChange}
      {onEnabledChange}
      {portalContainer}
      {layoutMode}
    />
  {/await}
</div>
