<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { updateItem } from '@/features/editor/deps/timeline-store'
  import type { TimelineItem } from '@/types/timeline'

  /** Stands in for `TextContentSection` in tests: a controlled text field. */
  let { items }: { items: TimelineItem[] } = $props()
  const item = $derived(items[0])
</script>

{#if item?.type === 'text'}
  <textarea
    aria-label="Text content"
    value={item.text}
    oninput={(event) => updateItem(item.id, { text: event.currentTarget.value })}
  ></textarea>
{:else}
  <div>Text Content Body</div>
{/if}
