<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import AudioVolumeControl from './audio-volume-control.svelte'
  import VideoFadeHandles from './video-fade-handles.svelte'

  // Renders a fade/volume control inside a clip-body stand-in, so tests can
  // check that its clicks never reach the clip.
  type Props =
    | {
        kind: 'video'
        controlProps: ComponentProps<typeof VideoFadeHandles>
        onParentClick: () => void
        onParentDoubleClick: () => void
      }
    | {
        kind: 'volume'
        controlProps: ComponentProps<typeof AudioVolumeControl>
        onParentClick: () => void
        onParentDoubleClick: () => void
      }

  let harness: Props = $props()
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div onclick={harness.onParentClick} ondblclick={harness.onParentDoubleClick}>
  {#if harness.kind === 'video'}
    <VideoFadeHandles {...harness.controlProps} />
  {:else}
    <AudioVolumeControl {...harness.controlProps} />
  {/if}
</div>
