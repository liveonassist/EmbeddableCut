<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  import type { MotionThumbnail } from '@/features/editor/deps/keyframes'

  const KIND_CLASS: Record<Exclude<MotionThumbnail['kind'], 'scale'>, string> = {
    fade: 'mp-fade',
    slide: 'mp-slide',
    spin: 'mp-spin',
    bounce: 'mp-bounce',
    pulse: 'mp-pulse',
    shake: 'mp-shake',
    wobble: 'mp-wobble',
    wiggle: 'mp-wiggle',
    drift: 'mp-drift',
    'micro-shake': 'mp-micro-shake',
  }
</script>

<script lang="ts">
  import { cn } from '@/shared/ui/cn'

  /**
   * A small animated glyph that demonstrates a motion preset. The motion runs
   * only on hover (see the co-located CSS, imported by styles/app.css) so the
   * full grid is idle at rest.
   */
  let { thumbnail }: { thumbnail: MotionThumbnail } = $props()

  const motionClass = $derived(
    thumbnail.kind === 'scale'
      ? thumbnail.direction === -1
        ? 'mp-scale-down'
        : 'mp-scale-up'
      : KIND_CLASS[thumbnail.kind],
  )
</script>

<span class="mp-thumb text-foreground/80" aria-hidden="true">
  <span
    class={cn('mp-shape', motionClass)}
    style:--mp-angle={thumbnail.angle !== undefined ? `${thumbnail.angle}deg` : undefined}
  ></span>
</span>
