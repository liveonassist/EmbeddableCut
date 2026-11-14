<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { CanvasSettings } from '@/types/transform'

  interface AnimationPresetLibraryProps {
    canvas: CanvasSettings
    embedded?: boolean
    variant?: 'full' | 'edit'
    itemIds?: string[]
  }

  let props: AnimationPresetLibraryProps = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>

<div></div>
