<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import ClipFilmstrip from './index.svelte'

  /** Renders ClipFilmstrip inside a live timeline item, as the timeline does. */
  let props: ComponentProps<typeof ClipFilmstrip> = $props()
</script>

<div data-timeline-scroll-container>
  <div
    data-timeline-item
    data-timeline-start-frame="0"
    data-timeline-duration-frames="96"
    data-timeline-fps="30"
    data-timeline-content-inset-start-px="1"
    data-timeline-content-inset-end-px="1"
  >
    <ClipFilmstrip {...props} />
  </div>
</div>
