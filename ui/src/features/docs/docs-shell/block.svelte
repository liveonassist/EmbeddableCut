<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Info from '@lucide/svelte/icons/info'
  import Lightbulb from '@lucide/svelte/icons/lightbulb'

  const NOTE_STYLES = {
    tip: {
      icon: Lightbulb,
      className: 'border-emerald-500/30 bg-emerald-500/5',
      iconClass: 'text-emerald-500',
    },
    warning: {
      icon: AlertTriangle,
      className: 'border-amber-500/30 bg-amber-500/5',
      iconClass: 'text-amber-500',
    },
    info: { icon: Info, className: 'border-primary/30 bg-primary/5', iconClass: 'text-primary' },
  } as const
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'
  import type { DocBlock } from '../docs-content'
  import RichText from './rich-text.svelte'

  /** One content block of a docs section: paragraph, list, steps, note, table or figure. */
  let { block }: { block: DocBlock } = $props()
</script>

{#if block.kind === 'paragraph'}
  <p><RichText text={block.text} /></p>
{:else if block.kind === 'list'}
  <ul class="list-disc space-y-2 pl-5">
    {#each block.items as item, index (index)}
      <li><RichText text={item} /></li>
    {/each}
  </ul>
{:else if block.kind === 'steps'}
  <ol class="list-decimal space-y-2 pl-5 marker:font-medium marker:text-foreground">
    {#each block.items as item, index (index)}
      <li class="pl-1"><RichText text={item} /></li>
    {/each}
  </ol>
{:else if block.kind === 'note'}
  {@const style = NOTE_STYLES[block.tone ?? 'info']}
  {@const Icon = style.icon}
  <div class={cn('flex gap-3 rounded-md border p-3', style.className)}>
    <Icon class={cn('mt-0.5 h-4 w-4 shrink-0', style.iconClass)} />
    <p><RichText text={block.text} /></p>
  </div>
{:else if block.kind === 'table'}
  <div class="overflow-x-auto rounded-md border border-border">
    <table class="w-full border-collapse text-sm">
      <thead>
        <tr class="border-b border-border bg-muted/40 text-left">
          {#each block.headers as header, index (index)}
            <th class="px-3 py-2 font-medium text-foreground"><RichText text={header} /></th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each block.rows as row, rowIndex (rowIndex)}
          <tr class="border-b border-border last:border-0">
            {#each row as cell, cellIndex (cellIndex)}
              <td class="px-3 py-2 align-top"><RichText text={cell} /></td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if block.kind === 'figure'}
  <figure class="space-y-2">
    <img
      src={block.figure.src}
      alt={block.figure.alt}
      loading="lazy"
      class="w-full rounded-lg border border-border"
    />
    {#if block.figure.caption}
      <figcaption class="text-xs text-muted-foreground">{block.figure.caption}</figcaption>
    {/if}
  </figure>
{/if}
