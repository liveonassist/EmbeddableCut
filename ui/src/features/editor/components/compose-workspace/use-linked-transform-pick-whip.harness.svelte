<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { usePropertyLinkPickWhip } from '@/features/editor/deps/timeline-motion'
  import PickWhipOverlay from '@/shared/ui/pick-whip-overlay.svelte'

  // Property rows the pick-whip can link between, as the Motion dope sheet renders them.
  const pickWhip = usePropertyLinkPickWhip()
</script>

<div data-testid="motion-layer-scroll-area">
  <div data-expression-item-id="target" data-expression-property="x">
    <button type="button" onpointerdown={(event) => pickWhip.begin(event, 'target', 'x')}>Target X</button>
  </div>
  <div data-testid="source-row" data-expression-item-id="source" data-expression-property="y">Source Y</div>
  <div data-expression-item-id="vector-target" data-expression-property="position">
    <button type="button" onpointerdown={(event) => pickWhip.begin(event, 'vector-target', 'position')}>
      Target Position
    </button>
  </div>
  <div data-testid="vector-source-row" data-expression-item-id="vector-source" data-expression-property="scale">
    Source Scale
  </div>
  <div data-testid="shape-source-row" data-expression-item-id="shape-source" data-expression-property="trimPathEnd">
    Shape Trim End
  </div>
  {#if pickWhip.drag}
    <PickWhipOverlay presentation={pickWhip.drag.presentation} testId="active-pick-whip" />
  {/if}
</div>
