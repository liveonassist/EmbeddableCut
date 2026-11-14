<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { getSelectState } from './context'

  /** Radix's Value: the selected item's label, `placeholder` when nothing is, or `children` instead. */
  type Props = Omit<HTMLAttributes<HTMLSpanElement>, 'placeholder'> & {
    ref?: HTMLSpanElement | null
    placeholder?: string | Snippet
  }

  let { ref = $bindable(null), placeholder, children, ...rest }: Props = $props()
  const select = getSelectState()
  const value = $derived(select?.value ?? '')
  const label = $derived(value === '' ? undefined : select?.label(value))
</script>

<span bind:this={ref} style:pointer-events="none" {...rest}>
  {#if children}
    {@render children()}
  {:else if label}
    {@render label()}
  {:else if value === ''}
    {#if typeof placeholder === 'string'}
      {placeholder}
    {:else}
      {@render placeholder?.()}
    {/if}
  {/if}
</span>
