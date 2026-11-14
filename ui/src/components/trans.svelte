<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import { t } from '$lib/i18n.svelte'

  /**
   * react-i18next's `Trans` with named components: a translation such as
   * `Access <code>{{name}}</code> again` renders each `<tag>…</tag>` through
   * the snippet of that name, which receives the tag's text. A tag without a
   * snippet renders its text.
   *
   * ```svelte
   * <Trans i18nKey="projects.workspaceGate.reconnectDescription" values={{ name }}>
   *   {#snippet code(text)}<span class="font-mono">{text}</span>{/snippet}
   * </Trans>
   * ```
   */
  let {
    i18nKey,
    values,
    ...components
  }: {
    i18nKey: string
    values?: Record<string, unknown>
    [tag: string]: Snippet<[string]> | string | Record<string, unknown> | undefined
  } = $props()

  type Part = { tag: null; text: string } | { tag: string; text: string }

  const parts = $derived.by(() => {
    const source = t(i18nKey, values)
    const result: Part[] = []
    const pattern = /<(\w+)>([\s\S]*?)<\/\1>|<(\w+)\s*\/>/g
    let last = 0
    for (const match of source.matchAll(pattern)) {
      if (match.index > last) result.push({ tag: null, text: source.slice(last, match.index) })
      result.push({ tag: match[1] ?? match[3]!, text: match[2] ?? '' })
      last = match.index + match[0].length
    }
    if (last < source.length) result.push({ tag: null, text: source.slice(last) })
    return result
  })

  function snippetFor(tag: string): Snippet<[string]> | null {
    const value = components[tag]
    return typeof value === 'function' ? (value as Snippet<[string]>) : null
  }
</script>

{#each parts as part, index (index)}{#if part.tag === null}{part.text}{:else}{@const render = snippetFor(
      part.tag,
    )}{#if render}{@render render(part.text)}{:else}{part.text}{/if}{/if}{/each}
