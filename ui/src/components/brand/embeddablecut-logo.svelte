<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  interface EmbeddableCutLogoProps {
    variant?: 'full' | 'icon'
    size?: 'sm' | 'md' | 'lg'
    class?: string
  }

  const sizeConfig = {
    sm: { icon: 'w-5 h-5', text: 'text-base', gap: 'gap-1.5' },
    md: { icon: 'w-7 h-7', text: 'text-xl', gap: 'gap-2' },
    lg: { icon: 'w-10 h-10', text: 'text-3xl', gap: 'gap-3' },
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  /**
   * EmbeddableCut's mark: a clip, cut, inside a viewfinder's corners. The
   * corners take the text color and the clip the accent, so it follows the
   * theme; `web/public/favicon.svg` is the same mark on a tile.
   */
  let { variant = 'full', size = 'md', class: className }: EmbeddableCutLogoProps = $props()
  const config = $derived(sizeConfig[size])
</script>

{#snippet mark(markClass: string)}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 24 24" class={markClass} aria-hidden="true">
    <path
      d="M5.5 11.5v-3a3 3 0 0 1 3-3h3M20.5 5.5h3a3 3 0 0 1 3 3v3M26.5 20.5v3a3 3 0 0 1-3 3h-3M11.5 26.5h-3a3 3 0 0 1-3-3v-3"
      fill="none"
      stroke="currentColor"
      stroke-width="2.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="text-muted-foreground"
    />
    <path
      d="M9 13a1 1 0 0 1 1-1h6.9l-1.8 8H10a1 1 0 0 1-1-1zM18.7 12H22a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-5.1z"
      fill="currentColor"
      class="text-primary"
    />
  </svg>
{/snippet}

{#if variant === 'icon'}
  {@render mark(cn(config.icon, className))}
{:else}
  <div class={cn('flex items-center', config.gap, className)}>
    {@render mark(config.icon)}
    <span class={cn(config.text, 'font-semibold tracking-tight text-foreground')}>EmbeddableCut</span>
  </div>
{/if}
