<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import ContainedMediaLayout from './contained-media-layout.svelte'

  let props: Omit<ComponentProps<typeof ContainedMediaLayout>, 'children'> = $props()
</script>

<ContainedMediaLayout {...props}>
  <div data-testid="media"></div>
</ContainedMediaLayout>
