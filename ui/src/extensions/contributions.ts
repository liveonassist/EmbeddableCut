// SPDX-License-Identifier: MIT

/**
 * What extensions and hosts add to the editor UI. Every piece is either a
 * Svelte component or a `render` function the host implements in its own
 * framework: the editor hands it a container element and a context, and calls
 * what it returns when the piece goes away.
 */

import type { Component } from 'svelte'
import type { Editor } from '@embeddablecut/sdk'
import type { TimelineItem, TimelineTrack } from '@/types/timeline'
import type { MediaMetadata } from '@/types/storage'

/** What every contributed piece is given. */
export interface UiContext {
  editor: Editor
}

/** Renders into `container`; returns its own teardown, if it needs one. */
export type HostRender<C> = (container: HTMLElement, context: C) => void | (() => void)

/** A Svelte component taking `{ context }`, or a host-rendered piece. */
export type Renderable<C = UiContext> = Component<{ context: C }> | { render: HostRender<C> }

/** A string names one of the editor's Lucide icons; a component draws its own. */
export type IconRef = string | Component

export interface PanelContribution {
  id: string
  title: string
  icon?: IconRef
  /** `media` is the left sidebar's tabs, `inspector` the right's, `bottom` beside the timeline. */
  region: 'media' | 'inspector' | 'bottom'
  /** Lower comes first; built-in panels sit at multiples of 100. */
  order?: number
  content: Renderable
}

export interface ToolbarContribution {
  id: string
  label: string
  icon?: IconRef
  region: 'left' | 'center' | 'right'
  order?: number
  /** A plain button; give `content` instead for a control of your own. */
  onSelect?: (context: UiContext) => void
  content?: Renderable
}

/** A section of the properties sidebar, for the items it applies to. */
export interface InspectorContribution {
  id: string
  title: string
  order?: number
  when?: (item: TimelineItem) => boolean
  content: Renderable<UiContext & { item: TimelineItem }>
}

export interface MenuTargets {
  clip: { item: TimelineItem }
  track: { track: TimelineTrack }
  media: { media: MediaMetadata }
  timeline: { frame: number }
}

export interface MenuContribution<M extends keyof MenuTargets = keyof MenuTargets> {
  id: string
  menu: M
  label: string
  icon?: IconRef
  order?: number
  when?: (target: MenuTargets[M]) => boolean
  onSelect: (context: UiContext & MenuTargets[M]) => void
}

/**
 * Built-in pieces a host can replace outright. Each receives the same
 * context as a contribution; the editor's own version is the default.
 */
export type ReplaceableSlot =
  | 'toolbar'
  | 'media-sidebar'
  | 'properties-sidebar'
  | 'preview'
  | 'timeline'
  | 'project-menu'

declare module '@embeddablecut/sdk' {
  interface UiContributions {
    panels?: PanelContribution[]
    toolbar?: ToolbarContribution[]
    inspector?: InspectorContribution[]
    menus?: MenuContribution[]
    /** Replacements for built-in pieces. */
    components?: Partial<Record<ReplaceableSlot, Renderable>>
  }
}
