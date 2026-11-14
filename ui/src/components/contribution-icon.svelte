<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Component } from 'svelte'
  import type { IconRef } from '../extensions/contributions'

  type IconComponent = Component<{ class?: string }>

  /**
   * A contributed piece's icon: its own component, or one of the editor's
   * Lucide icons by name (`'sparkles'`, `'file-video'`). Named icons load the
   * icon set on first use, so editors without contributions never fetch it.
   */
  let { icon, class: className = '' }: { icon: IconRef; class?: string } = $props()

  const pascal = (name: string) =>
    name.replace(/(?:^|[-_\s]+)([a-z0-9])/gi, (_, c: string) => c.toUpperCase())

  let named: IconComponent | null = $state.raw(null)

  $effect(() => {
    if (typeof icon !== 'string') return
    const name = pascal(icon)
    let active = true
    void import('lucide-svelte').then(({ icons }) => {
      if (active) named = ((icons as Record<string, unknown>)[name] as IconComponent) ?? null
    })
    return () => {
      active = false
    }
  })
</script>

{#if typeof icon !== 'string'}
  {@const Icon = icon as IconComponent}
  <Icon class={className} />
{:else if named}
  {@const Icon = named}
  <Icon class={className} />
{/if}
