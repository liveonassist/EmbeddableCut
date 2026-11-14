<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  /**
   * Full-featured value graph editor for keyframe animation.
   * Shows keyframes as draggable points with interpolation curves.
   */
  import ValueGraphEditorBase from './value-graph-editor-base.svelte'
  import type { ValueGraphEditorProps } from './value-graph-editor-props'

  let props: ValueGraphEditorProps = $props()
</script>

<ValueGraphEditorBase {...props} chrome="full" />
