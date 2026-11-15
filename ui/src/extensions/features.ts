// SPDX-License-Identifier: MIT

/**
 * The editor's built-in features a host can hide or lock, by id. Ids are
 * dotted and hierarchical: switching off `toolbar` switches off every
 * `toolbar.*`. A piece of UI belonging to several features (the AI tab is
 * `sidebar.ai` and `ai.generate`) takes the most restrictive of them.
 */

import type { Editor } from '@embeddablecut/sdk'
import type { HotkeyKey } from '@/config/hotkeys'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'

export const FEATURE_IDS = [
  // The top bar
  'toolbar',
  /** The back button and the project's name and specs. */
  'toolbar.project',
  /** The Edit, Color and Animate workspace switcher. */
  'toolbar.workspaces',
  /** The GitHub and Discord links. */
  'toolbar.community',
  'toolbar.docs',
  'toolbar.whats-new',
  'toolbar.settings',
  'toolbar.shortcuts',
  'toolbar.language',
  'toolbar.save',
  'toolbar.render-queue',
  'export',
  'export.video',
  /** Downloading the project as a zip. */
  'export.bundle',

  // The project's canvas, wherever the editor offers to change it
  'project',
  /** Width and height: the canvas panel's, and matching them to the first clip added. */
  'project.size',
  /** Matching the frame rate to the first clip added. */
  'project.frame-rate',
  /** The canvas panel's background color. */
  'project.background',

  // The left sidebar's tabs
  'sidebar',
  'sidebar.media',
  'sidebar.text',
  'sidebar.shapes',
  'sidebar.effects',
  'sidebar.transitions',
  /** Lottie stickers. */
  'sidebar.stickers',
  'sidebar.transcript',
  'sidebar.ai',

  // The media library's actions on a media item
  'media',
  'media.relink',
  'media.proxy',
  'media.delete',

  // The properties sidebar
  'inspector',
  /** The canvas panel shown when nothing is selected. */
  'inspector.canvas',
  /** The clip inspector's tabs, for the selected items. */
  'inspector.video',
  'inspector.audio',
  'inspector.effects',
  'inspector.animation',

  // The timeline's header and tools
  'timeline',
  'timeline.trim-tool',
  /** The razor tool and splitting at the cursor or playhead. */
  'timeline.razor',
  'timeline.rate-stretch',
  'timeline.slip-slide',
  /** Undo and redo. */
  'timeline.history',
  'timeline.in-out',
  'timeline.markers',
  /** Recording from the microphone. */
  'timeline.record',
  'timeline.snap',
  'timeline.audio-skimming',
  'timeline.keyframes',
  'timeline.linked-selection',

  // Clip actions (menu items and shortcuts), for the clips they act on
  'clip',
  'clip.delete',
  'clip.ripple-delete',
  'clip.clipboard',
  'clip.join',
  'clip.link',
  'clip.reverse',
  'clip.freeze-frame',
  /** Creating, opening and dissolving compound clips. */
  'clip.compound',

  // Track header actions
  'track',
  'track.add',
  'track.delete',
  'track.close-gaps',

  // AI and analysis, wherever they appear
  'ai',
  /** The AI tab's generation. */
  'ai.generate',
  /** Transcripts: the transcript tab and generating one for media. */
  'ai.transcript',
  /** Generating captions for a clip. */
  'ai.captions',
  /** Text to speech. */
  'ai.speech',
  /** Detecting scenes and splitting at them. */
  'ai.scenes',
  /** Removing silence and filler words. */
  'ai.cleanup',
  /** Analyzing media, frame interpolation and upscaling. */
  'ai.media',
] as const

export type FeatureId = (typeof FEATURE_IDS)[number]

/** How a feature shows: as usual, not at all, or visible but disabled. */
export type FeatureMode = 'on' | 'hidden' | 'locked'

/** What a feature applies to, when it acts on something. */
export interface FeatureTarget {
  /** The clips it acts on; the selection when the UI doesn't say. */
  items?: readonly TimelineItem[]
  /** The track, for track actions. */
  track?: TimelineTrack
}

export interface FeatureContext extends FeatureTarget {
  editor: Editor
  id: FeatureId
  items: readonly TimelineItem[]
}

/** `true` (the default) shows a feature, `false` hides it, `'locked'` shows it disabled. */
export type FeatureSetting = boolean | 'locked'

export type FeatureValue = FeatureSetting | ((context: FeatureContext) => FeatureSetting)

export type EditorFeatures = Partial<Record<FeatureId, FeatureValue>>

const RANK: Record<FeatureMode, number> = { on: 0, locked: 1, hidden: 2 }

function modeOf(setting: FeatureSetting): FeatureMode {
  return setting === 'locked' ? 'locked' : setting === false ? 'hidden' : 'on'
}

/** `toolbar.settings` → `toolbar`, `toolbar.settings`. */
function lineage(id: FeatureId): FeatureId[] {
  const parts = id.split('.')
  return parts.map((_, index) => parts.slice(0, index + 1).join('.') as FeatureId)
}

/** The most restrictive mode the host's settings give any of `ids` or their parents. */
export function resolveFeature(
  features: EditorFeatures,
  ids: FeatureId | readonly FeatureId[],
  context: Omit<FeatureContext, 'id'>,
): FeatureMode {
  let mode: FeatureMode = 'on'
  for (const id of typeof ids === 'string' ? [ids] : ids) {
    for (const ancestor of lineage(id)) {
      const value = features[ancestor]
      if (value === undefined) continue
      const next = modeOf(typeof value === 'function' ? value({ ...context, id }) : value)
      if (RANK[next] > RANK[mode]) mode = next
      if (mode === 'hidden') return mode
    }
  }
  return mode
}

/** The shortcuts each feature owns, which don't fire while it's hidden or locked. */
export const FEATURE_HOTKEYS: Partial<Record<FeatureId, readonly HotkeyKey[]>> = {
  'toolbar.workspaces': ['WORKSPACE_EDIT', 'WORKSPACE_COLOR', 'WORKSPACE_ANIMATE'],
  'toolbar.save': ['SAVE'],
  'export.video': ['EXPORT'],
  'timeline.trim-tool': ['TRIM_EDIT_TOOL'],
  'timeline.razor': ['RAZOR_TOOL', 'SPLIT_AT_CURSOR', 'SPLIT_AT_PLAYHEAD_ALT'],
  'timeline.rate-stretch': ['RATE_STRETCH_TOOL'],
  'timeline.slip-slide': ['SLIP_TOOL', 'SLIDE_TOOL'],
  'timeline.history': ['UNDO', 'REDO'],
  'timeline.in-out': ['MARK_IN', 'MARK_OUT', 'CLEAR_IN_OUT'],
  'timeline.markers': ['ADD_MARKER', 'REMOVE_MARKER'],
  'timeline.snap': ['TOGGLE_SNAP'],
  'timeline.linked-selection': ['TOGGLE_LINKED_SELECTION'],
  'clip.delete': ['DELETE_SELECTED', 'DELETE_SELECTED_ALT', 'CUT'],
  'clip.ripple-delete': ['RIPPLE_DELETE', 'RIPPLE_DELETE_ALT'],
  'clip.clipboard': ['COPY', 'CUT', 'PASTE'],
  'clip.join': ['JOIN_ITEMS'],
  'clip.link': ['LINK_AUDIO_VIDEO', 'UNLINK_AUDIO_VIDEO'],
  'clip.freeze-frame': ['FREEZE_FRAME'],
}
