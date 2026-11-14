<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { EditorUi } from '$lib/context'
  import EditorRoot from './editor-root.svelte'
  import EditorView from './editor-view.svelte'

  /** The full editor, as `mountEditor` mounts it. */
  let { ui }: { ui: EditorUi } = $props()
</script>

<EditorRoot {ui}>
  <EditorView />
</EditorRoot>
