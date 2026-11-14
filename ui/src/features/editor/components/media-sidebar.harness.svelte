<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { setEditorUi, type EditorUi } from '$lib/context'
  import { TooltipProvider } from '@/components/ui/tooltip'
  import MediaSidebar from './media-sidebar.svelte'

  /** Renders the media sidebar inside a (fake) mounted editor's UI context. */
  let { ui }: { ui: EditorUi } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi(ui)
</script>

<TooltipProvider>
  <MediaSidebar />
</TooltipProvider>
