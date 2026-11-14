<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { EditorUi } from '$lib/context'
  import { Editor } from '@/features/editor/components/editor'
  import EditorRoot from './editor-root.svelte'

  /**
   * The full editor, as `mountEditor` mounts it: FreeCut's editor for the
   * project the SDK has open (`openProject` or `loadDocument`, before or after
   * mounting), and nothing until one is.
   */
  let { ui }: { ui: EditorUi } = $props()
</script>

<EditorRoot {ui}>
  <Editor />
</EditorRoot>
