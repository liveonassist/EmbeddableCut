<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { AnimatableProperty } from '@/types/keyframe'

  interface KeyframeToggleProps {
    itemIds: string[]
    property: AnimatableProperty
    currentValue: number
    getCurrentValue?: () => number
    currentValuesByItemId?: Readonly<Record<string, number>>
    class?: string
    disabled?: boolean
  }

  let props: KeyframeToggleProps = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
