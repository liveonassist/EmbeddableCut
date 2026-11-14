<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  interface HighlightedTextProps {
    text: string
    /** Sorted, non-overlapping ranges (output of `findMatchSpans`). */
    spans: Array<[number, number]>
    class?: string
  }

  /**
   * Render `text` with `<mark/>` wrappers around each match span. Assumes
   * spans are sorted and non-overlapping — rank.ts merges overlaps before
   * returning them.
   */
  let { text, spans, class: className }: HighlightedTextProps = $props()

  const parts = $derived.by(() => {
    const result: Array<{ text: string; mark: boolean }> = []
    let cursor = 0
    for (const [from, to] of spans) {
      if (from > cursor) result.push({ text: text.slice(cursor, from), mark: false })
      result.push({ text: text.slice(from, to), mark: true })
      cursor = to
    }
    if (cursor < text.length) result.push({ text: text.slice(cursor), mark: false })
    return result
  })
</script>

{#if spans.length === 0}
  <span class={className}>{text}</span>
{:else}
  <span class={className}
    >{#each parts as part, index (index)}{#if part.mark}<mark
          class="bg-primary/25 text-foreground rounded-sm px-0.5 -mx-0.5">{part.text}</mark
        >{:else}{part.text}{/if}{/each}</span
  >
{/if}
