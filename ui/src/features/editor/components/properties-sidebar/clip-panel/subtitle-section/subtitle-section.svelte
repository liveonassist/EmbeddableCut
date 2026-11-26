<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import Captions from '@lucide/svelte/icons/captions'
  import { i18n } from '@/i18n'
  import { DEFAULT_PROJECT_HEIGHT, DEFAULT_PROJECT_WIDTH } from '@/shared/projects/defaults'
  import type { SubtitleSegmentItem, TimelineItem } from '@/types/timeline'

  import CaptionStyleControls from '../caption-style-controls.svelte'
  import { PropertySection } from '../../components'
  import SingleSubtitleSegmentEditor from './single-subtitle-segment-editor.svelte'
  import VirtualTranscriptSubtitleEditor from './virtual-transcript-subtitle-editor.svelte'
  import type { VirtualTranscriptCaptionClip } from './types'

  interface CanvasContext {
    width: number
    height: number
  }

  interface SubtitleSectionProps {
    items: TimelineItem[]
    canvas?: CanvasContext
  }

  /**
   * Properties panel for selected subtitle segments.
   *
   * Renders three stacked blocks:
   *  1. Style presets + quick controls (font/color/position/background)
   *  2. Source label + cue count
   *  3. Cue list editor
   *
   * Multi-select hides the cue list (cue identities differ across segments)
   * but keeps style controls active so a "make all my subtitle tracks
   * Netflix-style" workflow takes one click.
   */
  let { items, canvas }: SubtitleSectionProps = $props()

  const segments = $derived(
    items.filter((item): item is SubtitleSegmentItem => item.type === 'subtitle'),
  )
  const virtualTranscriptClips = $derived(
    items.filter(
      (item): item is VirtualTranscriptCaptionClip =>
        (item.type === 'video' || item.type === 'audio') &&
        item.isReversed !== true &&
        item.transcriptCaptions?.type === 'transcript' &&
        item.transcriptCaptions.cues.length > 0,
    ),
  )

  const canvasWidth = $derived(canvas?.width ?? DEFAULT_PROJECT_WIDTH)
  const canvasHeight = $derived(canvas?.height ?? DEFAULT_PROJECT_HEIGHT)
  const totalCues = $derived(segments.reduce((sum, segment) => sum + segment.cues.length, 0))
</script>

{#if segments.length === 0 && virtualTranscriptClips.length > 0}
  <VirtualTranscriptSubtitleEditor clips={virtualTranscriptClips} {canvasWidth} {canvasHeight} />
{:else if segments.length > 1}
  <PropertySection title={i18n.t('editor.subtitleSection.title')} icon={Captions} defaultOpen={true}>
    <div class="space-y-3 px-1">
      <CaptionStyleControls items={segments} {canvasWidth} {canvasHeight} />

      <p class="text-xs text-muted-foreground">
        {i18n.t('editor.subtitleSection.multiSelectHint', {
          segments: segments.length,
          cues: totalCues,
        })}
      </p>
    </div>
  </PropertySection>
{:else if segments.length === 1}
  <SingleSubtitleSegmentEditor segment={segments[0]!} {canvasWidth} {canvasHeight} />
{/if}
