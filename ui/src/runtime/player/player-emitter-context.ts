// SPDX-License-Identifier: MIT

import { getContext, setContext } from 'svelte'
import type { PlayerEmitter } from '@/runtime/player/player-emitter'

const PLAYER_EMITTER_KEY = Symbol('embeddablecut.player-emitter')

export function setPlayerEmitter(emitter: PlayerEmitter): void {
  setContext(PLAYER_EMITTER_KEY, emitter)
}

export function usePlayerEmitter(): PlayerEmitter {
  const emitter = getContext<PlayerEmitter | undefined>(PLAYER_EMITTER_KEY)
  if (!emitter) {
    throw new Error('usePlayerEmitter must be used within a Player component')
  }
  return emitter
}
