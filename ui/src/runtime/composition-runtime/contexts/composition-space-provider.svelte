<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    resolveCompositionScale,
    setCompositionSpace,
    type CompositionSpace,
  } from './composition-space-context'

  let {
    projectWidth,
    projectHeight,
    renderWidth,
    renderHeight,
    children,
  }: {
    projectWidth: number
    projectHeight: number
    renderWidth: number
    renderHeight: number
    children: Snippet
  } = $props()

  const value = $derived.by<CompositionSpace>(() => {
    const safeProjectWidth = projectWidth > 0 ? projectWidth : renderWidth
    const safeProjectHeight = projectHeight > 0 ? projectHeight : renderHeight
    const { scaleX, scaleY, scale } = resolveCompositionScale(
      safeProjectWidth,
      safeProjectHeight,
      renderWidth,
      renderHeight,
    )
    return {
      projectWidth: safeProjectWidth,
      projectHeight: safeProjectHeight,
      renderWidth,
      renderHeight,
      scaleX,
      scaleY,
      scale,
    }
  })

  setCompositionSpace({
    get current() {
      return value
    },
  })
</script>

{@render children()}
