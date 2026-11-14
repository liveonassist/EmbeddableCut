// SPDX-License-Identifier: MIT

import type { GpuEffectDefinition } from '@embeddablecut/engine/infrastructure/gpu-effects/types'
import type { GpuTransitionDefinition } from '@embeddablecut/engine/infrastructure/gpu-transitions/types'
import type { TransitionDefinition } from '@embeddablecut/engine/types/transition'
import type { Project } from '@embeddablecut/engine/types/project'
import type { ExtensionRequirement } from '@embeddablecut/engine/schema/index'
import {
  isBuiltInGpuEffect,
  registerGpuEffect,
  unregisterGpuEffect,
} from '@embeddablecut/engine/infrastructure/gpu-effects/registry'
import {
  registerGpuTransition,
  unregisterGpuTransition,
} from '@embeddablecut/engine/infrastructure/gpu-transitions/registry'
import {
  transitionRegistry,
  type TransitionRenderer,
} from '@embeddablecut/engine/shared/timeline/transitions/registry'
import '@embeddablecut/engine/shared/timeline/transitions/index'
import {
  registerEditOperation,
  unregisterEditOperation,
} from '@embeddablecut/engine/headless/edit-ops'
import { EditorError } from './errors'
import type { MediaProvider } from './media'

export type EffectDefinition = GpuEffectDefinition
export type { GpuTransitionDefinition, TransitionDefinition, TransitionRenderer }

/** A custom transition: what the picker shows, how it renders, and optionally its WebGPU shader. */
export interface TransitionExtension {
  definition: TransitionDefinition
  /** `renderCanvas` is the Canvas 2D path; set `gpuTransitionId` to the `gpu` shader's id for WebGPU. */
  renderer: TransitionRenderer
  gpu?: GpuTransitionDefinition
}

/**
 * Runs one custom edit op on the live timeline: validate the op's fields,
 * call the engine's timeline actions, return a JSON-serializable result.
 * Throw to refuse the op; nothing after it in the batch runs.
 */
export type OperationHandler = (op: Record<string, unknown>) => unknown

/**
 * What an extension contributes to the editor UI. Empty here: the UI
 * package adds its fields (panels, toolbar items, inspector sections, menus)
 * by declaration merging, so a headless host never needs it.
 */
// oxlint-disable-next-line typescript/no-empty-interface -- augmented by @embeddablecut/ui
export interface UiContributions {}

/**
 * One unit of extension. Everything it registers is removed again when it's
 * uninstalled. Extensions that a document depends on must be installed in
 * every editor and renderer that opens it; `requires` names them.
 */
export interface Extension {
  /** Reverse-DNS or vendor-prefixed, e.g. `acme.glow-pack`. */
  id: string
  version?: string
  effects?: EffectDefinition[]
  transitions?: TransitionExtension[]
  /** Custom edit ops by name, applied with `editor.timeline.apply`. */
  operations?: Record<string, OperationHandler>
  /** Resolve and renew URL assets this extension's sources produce. */
  mediaProviders?: MediaProvider[]
  ui?: UiContributions
}

const BUILT_IN_TRANSITIONS = new Set(transitionRegistry.getIds())

/** Every custom effect and transition `project` uses, which a renderer must provide. */
export function requirementsOf(project: Project): ExtensionRequirement[] {
  const found = new Map<string, ExtensionRequirement>()
  const add = (requirement: ExtensionRequirement) =>
    found.set(`${requirement.kind}:${requirement.id}`, requirement)
  type EffectsOwner = { effects?: ReadonlyArray<{ effect?: { gpuEffectType?: string } }> }
  const visit = (items: readonly unknown[] = [], transitions: readonly unknown[] = []) => {
    for (const item of items as EffectsOwner[]) {
      for (const effect of item.effects ?? []) {
        const id = effect.effect?.gpuEffectType
        if (id && !isBuiltInGpuEffect(id)) add({ kind: 'effect', id })
      }
    }
    for (const transition of transitions as Array<{ presentation?: string }>) {
      const id = transition.presentation
      if (id && !BUILT_IN_TRANSITIONS.has(id)) add({ kind: 'transition', id })
    }
  }
  visit(project.timeline?.items, project.timeline?.transitions)
  for (const composition of project.timeline?.compositions ?? []) {
    visit(composition.items, composition.transitions)
  }
  return [...found.values()]
}

/** The editor's installed extensions, over the engine's realm-wide registries. */
export class ExtensionHost {
  private readonly installed = new Map<string, { extension: Extension; undo: Array<() => void> }>()

  /**
   * Registers everything `extension` contributes, all or nothing.
   *
   * @throws {EditorError} `EXTENSION_CONFLICT` when its id is installed, or an
   *   effect, transition or op it defines already exists; nothing stays registered.
   */
  install(extension: Extension): () => void {
    if (this.installed.has(extension.id)) {
      throw new EditorError(
        'EXTENSION_CONFLICT',
        `Extension "${extension.id}" is already installed`,
      )
    }
    const undo: Array<() => void> = []
    try {
      for (const effect of extension.effects ?? []) {
        registerGpuEffect(effect)
        undo.push(() => unregisterGpuEffect(effect.id))
      }
      for (const transition of extension.transitions ?? []) {
        if (transitionRegistry.has(transition.definition.id)) {
          throw new Error(`Transition "${transition.definition.id}" is already registered`)
        }
        if (transition.gpu) {
          registerGpuTransition(transition.gpu)
          const gpuId = transition.gpu.id
          undo.push(() => unregisterGpuTransition(gpuId))
        }
        transitionRegistry.register(
          transition.definition.id,
          transition.definition,
          transition.renderer,
        )
        undo.push(() => transitionRegistry.unregister(transition.definition.id))
      }
      for (const [name, handler] of Object.entries(extension.operations ?? {})) {
        registerEditOperation(name, handler)
        undo.push(() => unregisterEditOperation(name))
      }
    } catch (error) {
      for (const step of undo.reverse()) step()
      throw new EditorError(
        'EXTENSION_CONFLICT',
        `Extension "${extension.id}" conflicts with one already installed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    this.installed.set(extension.id, { extension, undo })
    return () => this.uninstall(extension.id)
  }

  uninstall(id: string): boolean {
    const entry = this.installed.get(id)
    if (!entry) return false
    for (const step of entry.undo.reverse()) step()
    this.installed.delete(id)
    return true
  }

  uninstallAll(): void {
    for (const id of [...this.installed.keys()].reverse()) this.uninstall(id)
  }

  list(): Extension[] {
    return [...this.installed.values()].map(({ extension }) => extension)
  }

  mediaProviders(): MediaProvider[] {
    return this.list().flatMap((extension) => extension.mediaProviders ?? [])
  }

  /** The requirements no installed extension provides. */
  missing(requires: readonly ExtensionRequirement[]): ExtensionRequirement[] {
    const extensions = this.list()
    return requires.filter((requirement) => {
      switch (requirement.kind) {
        case 'effect':
          return !extensions.some((e) => e.effects?.some((effect) => effect.id === requirement.id))
        case 'transition':
          return !extensions.some((e) =>
            e.transitions?.some((t) => t.definition.id === requirement.id),
          )
        case 'media-provider':
          return !extensions.some((e) => e.mediaProviders?.some((p) => p.id === requirement.id))
      }
    })
  }
}
