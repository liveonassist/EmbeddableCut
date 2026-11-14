<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { getGhostPreviewItemClasses } from '@/features/timeline/utils/drag-drop-preview'
  import type { TimelineDropGhostPreview } from './timeline-drop-ghost-previews'

  interface Props {
    variant: 'track' | 'zone'
  }

  type PreviewNode = {
    root: HTMLDivElement
    label: HTMLSpanElement
  }

  let { variant }: Props = $props()

  let previewLayer: HTMLDivElement | null = null
  let previewNodes: PreviewNode[] = []

  export function clear() {
    previewLayer?.replaceChildren()
    previewNodes = []
  }

  export function sync(ghostPreviews: TimelineDropGhostPreview[]) {
    if (!previewLayer) {
      return
    }

    while (previewNodes.length > ghostPreviews.length) {
      previewNodes.pop()?.root.remove()
    }

    const isTrackPreview = variant === 'track'
    const labelClassName = isTrackPreview
      ? 'text-xs text-foreground/70 truncate'
      : 'truncate text-[10px] font-medium text-foreground/80'

    for (let index = 0; index < ghostPreviews.length; index += 1) {
      const ghost = ghostPreviews[index]!
      let previewNode = previewNodes[index]

      if (!previewNode) {
        const root = document.createElement('div')
        const label = document.createElement('span')
        root.appendChild(label)
        previewLayer.appendChild(root)
        previewNode = { root, label }
        previewNodes[index] = previewNode
      }

      previewNode.root.className = `absolute rounded border-2 border-dashed pointer-events-none z-20 flex items-center px-2 ${getGhostPreviewItemClasses(ghost.type)} ${
        isTrackPreview ? 'inset-y-0' : ''
      }`
      previewNode.root.style.left = `${ghost.left}px`
      previewNode.root.style.width = `${ghost.width}px`
      previewNode.root.style.top = isTrackPreview ? '' : '0'
      previewNode.root.style.height = isTrackPreview ? '' : '100%'
      previewNode.label.className = labelClassName
      previewNode.label.textContent = ghost.label
    }
  }
</script>

<div bind:this={previewLayer}></div>
