<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { mockPlayer, mockPlayerFrame } from './video-preview.sync.mock-state.svelte'

  interface Props {
    tracks?: Array<{ items?: Array<{ id?: string; src?: string; transform?: { x?: number } }> }>
    transitions?: Array<{ id: string }>
    keyframes?: typeof mockPlayer.lastCompositionKeyframes
  }

  let props: Props & Record<string, unknown> = $props()

  $effect.pre(() => {
    mockPlayer.lastCompositionKeyframes = props.keyframes ?? []
    mockPlayer.lastCompositionMediaSources = (props.tracks ?? [])
      .flatMap((track) => track.items ?? [])
      .map((item) => item.src ?? '')
      .filter((src) => src.length > 0)
  })
</script>

<div data-testid="mock-player-frame" data-transition-count={props.transitions?.length ?? 0}>
  {String(mockPlayerFrame.value)}
</div>
