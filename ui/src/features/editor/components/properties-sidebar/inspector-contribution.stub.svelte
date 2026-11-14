<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { UiContext } from '@/extensions/contributions'
  import type { TimelineItem } from '@/types/timeline'

  /** An extension's inspector section in tests: shows the item and editor it was given. */
  let { context }: { context: UiContext & { item: TimelineItem } } = $props()
</script>

<p data-testid="contributed-section" data-has-editor={String(Boolean(context.editor))}>
  Notes for {context.item.label}
</p>
