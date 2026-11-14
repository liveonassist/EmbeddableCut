<!-- SPDX-License-Identifier: MIT -->
<!--
  Stands in for DopesheetEditor, which the keyframes port provides: renders the
  surfaces the requested `visualizationMode` shows, with the real test ids.
-->
<script lang="ts">
  import type { DopesheetEditorProps } from '@/features/timeline/deps/keyframe-editors-ui'

  let { visualizationMode = 'dopesheet' }: DopesheetEditorProps = $props()
</script>

<div data-testid="dopesheet-editor-root" data-visualization-mode={visualizationMode}>
  {#if visualizationMode !== 'graph'}
    <div data-testid="dopesheet-playhead-clip"></div>
  {/if}
  {#if visualizationMode !== 'dopesheet'}
    <div data-testid="dopesheet-graph-pane"></div>
  {/if}
</div>
