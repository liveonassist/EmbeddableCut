<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import TextSectionComposer from './text-section-composer.svelte'
  import type { TextSectionProps } from './types'

  let props: TextSectionProps = $props()
</script>

<TextSectionComposer {...props} slots={['content']} />
