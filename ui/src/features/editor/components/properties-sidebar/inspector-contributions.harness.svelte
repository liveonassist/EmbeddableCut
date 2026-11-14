<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { setEditorUi, type EditorUi } from '$lib/context'
  import InspectorContributions from './inspector-contributions.svelte'

  /** Renders the contributed inspector sections inside a given editor UI context. */
  let { ui, item }: { ui: EditorUi; item: TimelineItem } = $props()

  // svelte-ignore state_referenced_locally
  setEditorUi(ui)
</script>

<InspectorContributions {item} />
