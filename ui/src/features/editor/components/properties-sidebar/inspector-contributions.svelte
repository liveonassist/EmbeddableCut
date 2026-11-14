<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { TimelineItem } from '@/types/timeline'
  import { getEditorUi } from '$lib/context'
  import Contribution from '$components/contribution.svelte'
  import { PropertySection } from './components'

  /**
   * The inspector sections hosts and extensions contribute for `item`, each
   * in a collapsible section like the built-in ones.
   */
  let { item }: { item: TimelineItem } = $props()

  const ui = getEditorUi()
  const sections = $derived(ui.contributions.inspector(item))
  const context = $derived({ editor: ui.editor, item })
</script>

{#each sections as section (section.id)}
  <div data-inspector-contribution={section.id}>
    <PropertySection title={section.title}>
      <Contribution content={section.content} {context} />
    </PropertySection>
  </div>
{/each}
