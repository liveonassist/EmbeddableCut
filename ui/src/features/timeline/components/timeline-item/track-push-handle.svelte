<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  const TRACK_PUSH_COLORS = {
    edge: 'rgba(56, 189, 248, 0.9)',
    glow: '0 0 8px rgba(56, 189, 248, 0.5)',
    fade: 'rgba(56, 189, 248, 0.3)',
  }

  interface TrackPushHandleProps {
    enabled: boolean
    isActive: boolean
    /** CSS length for the clip's left edge in timeline-content coordinates */
    clipLeftStyle: string
    /** CSS length for the trigger zone width (can reference shared zoom vars) */
    zoneStyle: string
    onMouseDown: (e: MouseEvent) => void
  }

  /**
   * Small trigger zone that sits in the gap immediately to the LEFT of a clip.
   * Rendered as a sibling of the clip container (outside `contain: paint`) so
   * it is not clipped.
   *
   * On hover it reveals a cyan edge halo; dragging it pushes ALL items at or
   * after this clip's time position (across every track) left or right.
   *
   * Hover visuals are CSS-only (group-hover) to avoid re-renders.
   */
  let { enabled, isActive, clipLeftStyle, zoneStyle, onMouseDown }: TrackPushHandleProps =
    $props()
</script>

{#if enabled || isActive}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-y-px cursor-track-push group/trackpush"
    data-track-push
    style:left="calc({clipLeftStyle} - {zoneStyle})"
    style:width={zoneStyle}
    style:z-index="1"
    onmousedown={onMouseDown}
  >
    <!-- Visuals: CSS-only hover — no state re-renders -->
    <div
      class={isActive ? 'opacity-100' : 'opacity-0 group-hover/trackpush:opacity-100'}
      style:transition="opacity 75ms"
      style:position="absolute"
      style:inset="0"
    >
      <!-- Solid edge line (right side = clip boundary) -->
      <div
        class="absolute inset-y-0 right-0"
        style:width="2px"
        style:background={TRACK_PUSH_COLORS.edge}
        style:box-shadow={TRACK_PUSH_COLORS.glow}
      ></div>
      <!-- Fade halo into gap -->
      <div
        class="absolute inset-y-0"
        style:right="2px"
        style:width="max(0px, calc({zoneStyle} - 2px))"
        style:background="linear-gradient(to left, {TRACK_PUSH_COLORS.fade}, transparent)"
      ></div>
    </div>
  </div>
{/if}
