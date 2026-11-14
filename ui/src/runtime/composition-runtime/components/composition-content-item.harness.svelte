<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import { useItemKeyframesFromContext } from '../contexts/keyframes-context'

  // Test stand-in for ItemContent: reports what it was given.
  let {
    item,
    muted,
  }: { item: { id: string; src?: string; audioSrc?: string }; muted?: boolean } = $props()

  const keyframes = useItemKeyframesFromContext(() => item.id)
  const keyframeCount = $derived(
    keyframes.current?.properties.reduce((count, property) => count + property.keyframes.length, 0) ??
      0,
  )
</script>

<div
  data-testid="sub-item-{item.id}"
  data-muted={muted ? 'true' : 'false'}
  data-keyframe-count={String(keyframeCount)}
  data-src={item.src ?? ''}
  data-audio-src={item.audioSrc ?? ''}
></div>
