<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TextSectionComposer from './text-section-composer.svelte'
  import type { TextSectionProps } from './types'

  /** Style (shadow / stroke / style presets) on its own — the Text tab. */
  let props: TextSectionProps = $props()
</script>

<TextSectionComposer {...props} slots={['effects']} />
