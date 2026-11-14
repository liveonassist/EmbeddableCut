<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TextSectionComposer from './text-section-composer.svelte'
  import type { TextSectionProps } from './types'

  /**
   * Style + animation together — used only for mixed (text + non-text)
   * selections, which keep the general Effects-tab layout.
   */
  let props: TextSectionProps = $props()
</script>

<TextSectionComposer {...props} slots={['effects', 'animation']} />
