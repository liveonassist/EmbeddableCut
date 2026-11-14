<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /** The value graph without its toolbar, keyboard hints, border or frame labels. */
  import ValueGraphEditorBase from './value-graph-editor-base.svelte'
  import type { EmbeddedValueGraphEditorProps } from './value-graph-editor-props'

  let props: EmbeddedValueGraphEditorProps = $props()
</script>

<ValueGraphEditorBase {...props} chrome="embedded" />
