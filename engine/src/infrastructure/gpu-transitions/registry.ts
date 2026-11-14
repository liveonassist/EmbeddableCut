import type { GpuTransitionDefinition } from './types'

import { dissolve } from './transitions/dissolve'
import {
  additiveDissolve,
  blurDissolve,
  dipToColorDissolve,
  nonAdditiveDissolve,
  smoothCut,
} from './transitions/dissolve-variants'
import { sparkles } from './transitions/sparkles'
import { glitch } from './transitions/glitch'
import { pixelate } from './transitions/pixelate'
import { chromatic } from './transitions/chromatic'
import { radialBlur } from './transitions/radial-blur'
import { fade } from './transitions/fade'
import { wipe } from './transitions/wipe'
import { slide } from './transitions/slide'
import { flip } from './transitions/flip'
import { clockWipe } from './transitions/clock-wipe'
import { iris } from './transitions/iris'
import { liquidDistort } from './transitions/liquid-distort'
import { lensWarpZoom } from './transitions/lens-warp-zoom'
import { lightLeakBurn } from './transitions/light-leak-burn'
import { filmGateSlip } from './transitions/film-gate-slip'

export const GPU_TRANSITION_REGISTRY = new Map<string, GpuTransitionDefinition>()

function register(def: GpuTransitionDefinition) {
  GPU_TRANSITION_REGISTRY.set(def.id, def)
}

/**
 * Adds a GPU transition from outside the built-in set (an SDK extension).
 * Pipelines already running compile it the first time a frame uses it.
 *
 * @throws when `def.id` is already registered.
 */
export function registerGpuTransition(def: GpuTransitionDefinition): void {
  if (GPU_TRANSITION_REGISTRY.has(def.id)) {
    throw new Error(`GPU transition "${def.id}" is already registered`)
  }
  register(def)
}

/** Removes a transition `registerGpuTransition` added; built-ins stay. */
export function unregisterGpuTransition(id: string): boolean {
  if (BUILT_IN_GPU_TRANSITION_IDS.has(id)) return false
  return GPU_TRANSITION_REGISTRY.delete(id)
}

register(dissolve)
register(additiveDissolve)
register(blurDissolve)
register(dipToColorDissolve)
register(nonAdditiveDissolve)
register(smoothCut)
register(sparkles)
register(glitch)
register(pixelate)
register(chromatic)
register(radialBlur)
register(fade)
register(wipe)
register(slide)
register(flip)
register(clockWipe)
register(iris)
register(liquidDistort)
register(lensWarpZoom)
register(lightLeakBurn)
register(filmGateSlip)

const BUILT_IN_GPU_TRANSITION_IDS = new Set(GPU_TRANSITION_REGISTRY.keys())

export function getGpuTransition(id: string): GpuTransitionDefinition | undefined {
  return GPU_TRANSITION_REGISTRY.get(id)
}

export function getGpuTransitionIds(): string[] {
  return Array.from(GPU_TRANSITION_REGISTRY.keys())
}
