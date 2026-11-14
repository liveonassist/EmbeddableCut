<!-- SPDX-License-Identifier: MIT -->
<!--
  Stable Video Sequence

  Renders video items with stable keys based on origin: items sharing the same
  originId are grouped into a single Sequence keyed by it, so splitting a clip
  reuses the same Sequence and video element instead of remounting.
-->
<script lang="ts">
  import { Sequence } from '@/runtime/composition-runtime/deps/player'
  import { groupStableVideoItems, type StableVideoGroup } from '@/runtime/composition-runtime/utils/video-scene'
  import type { TimelineItem } from '@/types/timeline'
  import type { ResolvedTransitionWindow } from '@/shared/timeline/transitions/transition-planner'
  import { useVideoConfig } from '../../hooks/use-player-compat.svelte'
  import { areGroupPropsEqual } from '../stable-video-sequence-comparator'
  import GroupRenderer from './group-renderer.svelte'
  import type { StableVideoSequenceItem, StableVideoSequenceProps } from './types'

  let { items, transitionWindows, renderItem, premountFor = 0 }: StableVideoSequenceProps = $props()

  const videoConfig = useVideoConfig()
  const defaultPremount = $derived(premountFor || Math.round(videoConfig.fps * 2))

  interface GroupProps {
    group: StableVideoGroup<StableVideoSequenceItem>
    transitionWindows?: ResolvedTransitionWindow<TimelineItem>[]
  }

  // React memoized GroupRenderer with `areGroupPropsEqual`, so a group whose
  // render-relevant fields are unchanged kept its previous props. Reusing the
  // previous objects here does the same: its renderer re-derives nothing.
  let previousGroupProps = new Map<string, GroupProps>()
  const groupProps = $derived.by(() => {
    const next = new Map<string, GroupProps>()
    const list = groupStableVideoItems(items).map((group) => {
      const candidate: GroupProps = { group, transitionWindows }
      const previous = previousGroupProps.get(group.originKey)
      const kept =
        previous &&
        areGroupPropsEqual(
          { ...previous, renderItem },
          { ...candidate, renderItem },
        )
          ? previous
          : candidate
      next.set(group.originKey, kept)
      return kept
    })
    previousGroupProps = next
    return list
  })
</script>

{#each groupProps as entry (entry.group.originKey)}
  <!-- Stable key - doesn't change on split! -->
  <Sequence
    from={entry.group.minFrom}
    durationInFrames={entry.group.maxEnd - entry.group.minFrom}
    premountFor={defaultPremount}
  >
    <GroupRenderer
      group={entry.group}
      transitionWindows={entry.transitionWindows}
      {renderItem}
    />
  </Sequence>
{/each}
