<!-- SPDX-License-Identifier: MIT -->
<!-- placeholder: ported elsewhere -->
<script lang="ts">
  import type { AnimatableProperty } from '@/types/keyframe'

  interface Props {
    itemIds: string[]
    property: AnimatableProperty
    currentValue: number
    getCurrentValue?: () => number
    currentValuesByItemId?: Readonly<Record<string, number>>
    class?: string
    disabled?: boolean
  }

  const props: Props = $props()
  // svelte-ignore state_referenced_locally
  void props
</script>
