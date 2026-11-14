<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { Link } from '@/app/router'
  import { richTextTokens } from './search'

  /** Renders inline `**bold**`, `` `code` ``, and `[text](page-slug)` links inside doc strings. */
  let { text }: { text: string } = $props()

  const tokens = $derived(
    richTextTokens(text).map((token) => {
      if (token.startsWith('**') && token.endsWith('**'))
        return { kind: 'bold' as const, text: token.slice(2, -2) }
      if (token.startsWith('`') && token.endsWith('`'))
        return { kind: 'code' as const, text: token.slice(1, -1) }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link) return { kind: 'link' as const, text: link[1]!, slug: link[2]! }
      return { kind: 'text' as const, text: token }
    }),
  )
</script>

{#each tokens as token, index (index)}{#if token.kind === 'bold'}<strong
      class="font-medium text-foreground">{token.text}</strong
    >{:else if token.kind === 'code'}<kbd
      class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
      >{token.text}</kbd
    >{:else if token.kind === 'link'}<Link
      to="/docs/$slug"
      params={{ slug: token.slug }}
      class="font-medium text-primary underline-offset-2 hover:underline">{token.text}</Link
    >{:else}<span>{token.text}</span>{/if}{/each}
