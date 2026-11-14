<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { select } from '$lib/store.svelte'
  import { usePlaybackStore } from '@/shared/state/playback'
  import InlineCompositionPreviewContent from './inline-composition-preview/inline-composition-preview-content.svelte'

  interface InlineCompositionPreviewProps {
    compositionId: string
    seekFrame: number | null
    containerSize: {
      width: number
      height: number
    }
    presentation?: 'workspace' | 'frame'
  }

  let { compositionId, seekFrame, containerSize, presentation = 'workspace' }: InlineCompositionPreviewProps = $props()
  const useProxy = select(usePlaybackStore, (s) => s.useProxy)
  const requestKey = $derived(`${compositionId}:${useProxy.current ? 'proxy' : 'source'}`)
</script>

{#key requestKey}
  <InlineCompositionPreviewContent
    compositionId={compositionId}
    seekFrame={seekFrame}
    containerSize={containerSize}
    presentation={presentation}
   />
{/key}
