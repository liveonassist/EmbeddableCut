<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Captions from '@lucide/svelte/icons/captions'
  import { select } from '$lib/store.svelte'
  import { i18n } from '@/i18n'
  import { updateItem, useTimelineSettingsStore } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { SubtitleSegmentItem } from '@/types/timeline'

  import CaptionStyleControls from '../caption-style-controls.svelte'
  import { PropertySection } from '../../components'
  import VirtualCueList from './virtual-cue-list.svelte'
  import type { CuePatch } from './types'

  interface SingleSubtitleSegmentEditorProps {
    segment: SubtitleSegmentItem
    canvasWidth: number
    canvasHeight: number
  }

  let { segment, canvasWidth, canvasHeight }: SingleSubtitleSegmentEditorProps = $props()

  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const setCurrentFrame = select(usePlaybackStore, (s) => s.setCurrentFrame)

  // Reads the latest cues at call time, so editing one cue doesn't touch the
  // other rows' handlers.
  const updateCue = (cueId: string, patch: CuePatch) => {
    const next = segment.cues.map((cue) => (cue.id === cueId ? { ...cue, ...patch } : cue))
    updateItem(segment.id, { cues: next })
  }

  const seekToCue = (startSeconds: number) => {
    const targetFrame = segment.from + Math.round(startSeconds * fps.current)
    setCurrentFrame.current(Math.max(0, targetFrame))
  }

  const sourceLabel = $derived(
    segment.source.type === 'embedded-subtitles'
      ? (segment.source.trackName ??
          segment.source.language ??
          i18n.t('editor.subtitleSection.trackLabel', { number: segment.source.trackNumber }))
      : segment.source.type === 'subtitle-import'
        ? segment.source.fileName
        : i18n.t('editor.subtitleSection.transcript'),
  )

  const styleItems = $derived([segment])
</script>

<PropertySection title={i18n.t('editor.subtitleSection.title')} icon={Captions} defaultOpen={true}>
  <div class="space-y-3 px-1">
    <p class="text-xs text-muted-foreground">
      {i18n.t('editor.subtitleSection.cueCount', { count: segment.cues.length })} -
      {sourceLabel}
    </p>

    <CaptionStyleControls items={styleItems} {canvasWidth} {canvasHeight} />

    <VirtualCueList cues={segment.cues} onChange={updateCue} onSeek={seekToCue} />
  </div>
</PropertySection>
