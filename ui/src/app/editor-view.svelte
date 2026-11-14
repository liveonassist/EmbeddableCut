<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Editor } from '@/features/editor/components/editor'

  /**
   * The full editor over the SDK editor's open project, inside an editor
   * root: `editor-app.svelte` for `mountEditor`, the editor route in the app.
   * The SDK opens the project (`openProject` or `loadDocument`, before or
   * after mounting); the editor renders nothing until it has.
   */
</script>

<Editor />
