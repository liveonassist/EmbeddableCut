<!-- SPDX-License-Identifier: MIT -->
<!--
  AbsoluteFill - Full container positioning component

  Fills its parent container with absolute positioning.
  Useful as a container for compositing layers.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'

  interface AbsoluteFillProps {
    /** Children to render */
    children?: Snippet
    /** Custom styles (merged with, and overriding, the absolute fill styles) */
    style?: string
    /** Custom class name */
    class?: string
    ref?: HTMLDivElement | null
  }

  let {
    children,
    style,
    class: className,
    ref = $bindable(null),
  }: AbsoluteFillProps = $props()

  const absoluteFillStyle =
    'position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; display: flex; flex-direction: column;'
</script>

<div
  bind:this={ref}
  class={className}
  style={style ? `${absoluteFillStyle} ${style}` : absoluteFillStyle}
>
  {@render children?.()}
</div>
