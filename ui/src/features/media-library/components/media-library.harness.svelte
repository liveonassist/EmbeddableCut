<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { TooltipProvider } from '@/components/ui/tooltip'
  import { setEditorUi, type EditorUi } from '$lib/context'
  import MediaLibrary from './media-library.svelte'

  interface MediaLibraryHarnessProps {
    mediaSources: { local: boolean; url: boolean }
    addUrl: (media: { url: string }) => Promise<unknown>
  }

  let { mediaSources, addUrl }: MediaLibraryHarnessProps = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi({
    editor: { mediaSources, media: { addUrl } },
    portalTarget: document.body,
  } as unknown as EditorUi)
</script>

<!-- The editor root provides this, as FreeCut's app shell does. -->
<TooltipProvider>
  <MediaLibrary />
</TooltipProvider>
