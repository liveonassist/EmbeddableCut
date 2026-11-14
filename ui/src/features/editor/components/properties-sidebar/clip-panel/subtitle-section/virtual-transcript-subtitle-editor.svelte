<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Captions from 'lucide-svelte/icons/captions'
  import { select } from '$lib/store.svelte'
  import { i18n } from '@/i18n'
  import { Label } from '@/components/ui/label'
  import { updateItem, useTimelineSettingsStore } from '@/features/editor/deps/timeline-store'
  import { usePlaybackStore } from '@/shared/state/playback'
  import type { SubtitleSegmentItem, TextItem, TimelineItem } from '@/types/timeline'

  import CaptionStyleControls from '../caption-style-controls.svelte'
  import { PropertySection } from '../../components'
  import VirtualCueList from './virtual-cue-list.svelte'
  import type { CuePatch, VirtualTranscriptCaptionClip } from './types'

  interface VirtualTranscriptSubtitleEditorProps {
    clips: VirtualTranscriptCaptionClip[]
    canvasWidth: number
    canvasHeight: number
  }

  let { clips, canvasWidth, canvasHeight }: VirtualTranscriptSubtitleEditorProps = $props()

  const fps = select(useTimelineSettingsStore, (s) => s.fps)
  const setCurrentFrame = select(usePlaybackStore, (s) => s.setCurrentFrame)
  const firstClip = $derived(clips[0]!)
  const totalCues = $derived(
    clips.reduce((sum, clip) => sum + clip.transcriptCaptions.cues.length, 0),
  )
  const captionsVisible = $derived(clips.every((clip) => clip.transcriptCaptions.enabled))

  const styleSample = $derived.by((): SubtitleSegmentItem => {
    const style = firstClip.transcriptCaptions.style ?? {}
    return {
      id: `${firstClip.id}:transcript-captions-style`,
      type: 'subtitle',
      trackId: firstClip.trackId,
      from: firstClip.from,
      durationInFrames: firstClip.durationInFrames,
      label: i18n.t('editor.subtitleSection.transcript'),
      mediaId: firstClip.mediaId,
      source: {
        type: 'transcript',
        mediaId: firstClip.transcriptCaptions.mediaId,
        clipId: firstClip.id,
      },
      cues: [],
      color: style.color ?? '#ffffff',
      ...style,
    }
  })

  const styleItems = $derived([styleSample])

  const applyStylePatch = (patch: Partial<SubtitleSegmentItem | TextItem>) => {
    for (const clip of clips) {
      updateItem(clip.id, {
        transcriptCaptions: {
          ...clip.transcriptCaptions,
          style: {
            ...(clip.transcriptCaptions.style ?? {}),
            ...patch,
          },
          updatedAt: Date.now(),
        },
      } as Partial<TimelineItem>)
    }
  }

  const setCaptionsVisible = (enabled: boolean) => {
    for (const clip of clips) {
      updateItem(clip.id, {
        transcriptCaptions: {
          ...clip.transcriptCaptions,
          enabled,
          updatedAt: Date.now(),
        },
      } as Partial<TimelineItem>)
    }
  }

  const updateCue = (cueId: string, patch: CuePatch) => {
    const next = firstClip.transcriptCaptions.cues.map((cue) =>
      cue.id === cueId ? { ...cue, ...patch } : cue,
    )
    updateItem(firstClip.id, {
      transcriptCaptions: {
        ...firstClip.transcriptCaptions,
        cues: next,
        updatedAt: Date.now(),
      },
    } as Partial<TimelineItem>)
  }

  const seekToCue = (startSeconds: number) => {
    const sourceFps = firstClip.sourceFps ?? fps.current
    const sourceStartSeconds = (firstClip.sourceStart ?? 0) / sourceFps
    const speed = firstClip.speed ?? 1
    const timelineSeconds = Math.max(0, (startSeconds - sourceStartSeconds) / speed)
    setCurrentFrame.current(
      Math.max(0, firstClip.from + Math.round(timelineSeconds * fps.current)),
    )
  }
</script>

{#snippet visibilityToggle()}
  <div
    class="flex items-center justify-between gap-3 rounded border border-border bg-muted/20 px-2 py-1.5"
  >
    <Label for="virtual-transcript-captions-visible" class="text-xs font-medium">
      {i18n.t('editor.subtitleSection.showSubtitle')}
    </Label>
    <input
      id="virtual-transcript-captions-visible"
      type="checkbox"
      checked={captionsVisible}
      onchange={(event) => setCaptionsVisible(event.currentTarget.checked)}
      class="h-4 w-4 rounded border-border accent-primary"
    />
  </div>
{/snippet}

{#if clips.length > 1}
  <PropertySection title={i18n.t('editor.subtitleSection.title')} icon={Captions} defaultOpen={true}>
    <div class="space-y-3 px-1">
      {@render visibilityToggle()}

      <CaptionStyleControls
        items={styleItems}
        {canvasWidth}
        {canvasHeight}
        onApplyPatch={applyStylePatch}
      />

      <p class="text-xs text-muted-foreground">
        {i18n.t('editor.subtitleSection.multiSelectHint', {
          segments: clips.length,
          cues: totalCues,
        })}
      </p>
    </div>
  </PropertySection>
{:else}
  <PropertySection title={i18n.t('editor.subtitleSection.title')} icon={Captions} defaultOpen={true}>
    <div class="space-y-3 px-1">
      <p class="text-xs text-muted-foreground">
        {i18n.t('editor.subtitleSection.cueCount', {
          count: firstClip.transcriptCaptions.cues.length,
        })}
        - {i18n.t('editor.subtitleSection.transcript')}
      </p>

      {@render visibilityToggle()}

      <CaptionStyleControls
        items={styleItems}
        {canvasWidth}
        {canvasHeight}
        onApplyPatch={applyStylePatch}
      />

      <VirtualCueList
        cues={firstClip.transcriptCaptions.cues}
        onChange={updateCue}
        onSeek={seekToCue}
      />
    </div>
  </PropertySection>
{/if}
