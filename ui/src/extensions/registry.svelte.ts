// SPDX-License-Identifier: MIT

import type { Editor, UiContributions } from '@embeddablecut/sdk'
import type {
  InspectorContribution,
  MenuContribution,
  MenuTargets,
  PanelContribution,
  Renderable,
  ReplaceableSlot,
  ToolbarContribution,
} from './contributions'

const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 1000) - (b.order ?? 1000)

/**
 * Everything contributed to the UI, from the host's own `ui` option and from
 * installed extensions, kept current as extensions come and go.
 */
export class ContributionRegistry {
  private sources = $state.raw<UiContributions[]>([])
  private readonly stop: () => void

  constructor(
    editor: Editor,
    private host: UiContributions = {},
  ) {
    const refresh = () => {
      this.sources = [this.host, ...editor.extensions.list().map((e) => e.ui ?? {})]
    }
    refresh()
    this.stop = editor.extensions.subscribe(refresh)
  }

  /** Replaces what the host contributes directly (`MountedEditor.configure`). */
  setHost(host: UiContributions): void {
    this.host = host
    this.sources = [host, ...this.sources.slice(1)]
  }

  panels(region: PanelContribution['region']): PanelContribution[] {
    return this.sources
      .flatMap((s) => s.panels ?? [])
      .filter((p) => p.region === region)
      .sort(byOrder)
  }

  toolbar(region: ToolbarContribution['region']): ToolbarContribution[] {
    return this.sources
      .flatMap((s) => s.toolbar ?? [])
      .filter((t) => t.region === region)
      .sort(byOrder)
  }

  inspector(
    item: Parameters<NonNullable<InspectorContribution['when']>>[0],
  ): InspectorContribution[] {
    return this.sources
      .flatMap((s) => s.inspector ?? [])
      .filter((section) => section.when?.(item) ?? true)
      .sort(byOrder)
  }

  menu<M extends keyof MenuTargets>(menu: M, target: MenuTargets[M]): MenuContribution<M>[] {
    const entries = this.sources.flatMap((s) => s.menus ?? []) as unknown as MenuContribution<M>[]
    return entries
      .filter((entry) => entry.menu === menu)
      .filter((entry) => entry.when?.(target) ?? true)
      .sort(byOrder)
  }

  /** The host's or an extension's replacement for a built-in piece; the host's wins. */
  replacement(slot: ReplaceableSlot): Renderable | null {
    for (const source of this.sources) {
      const component = source.components?.[slot]
      if (component) return component
    }
    return null
  }

  dispose(): void {
    this.stop()
  }
}
