<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TrimHandles from './trim-handles.svelte'

  let { onTrimStart }: { onTrimStart: (e: MouseEvent, handle: 'start' | 'end') => void } =
    $props()
</script>

<!-- The timeline item's structure: parent clip div → [overlay wrapper (z-30,
     pointer-events-none)] + [TrimHandles] -->
<div style:position="relative" style:width="200px" style:height="60px">
  <!-- Simulated video fade overlay wrapper — must be pointer-events-none -->
  <div
    data-testid="overlay-wrapper"
    class="absolute inset-x-0 bottom-0 z-30 pointer-events-none"
    style:top="18px"
  ></div>

  <TrimHandles
    trackLocked={false}
    isAnyDragActive={false}
    isTrimming={false}
    trimHandle={null}
    activeTool="trim-edit"
    hoveredEdge="start"
    smartTrimIntent={null}
    rollHoverEdge={null}
    activeEdges={null}
    startCursorClass="cursor-trim-left"
    endCursorClass="cursor-trim-right"
    startTone="default"
    endTone="default"
    hasJoinableLeft={false}
    hasJoinableRight={false}
    {onTrimStart}
    onJoinLeft={() => {}}
    onJoinRight={() => {}}
  />
</div>
