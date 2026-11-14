// SPDX-License-Identifier: MIT

import type { ItemKeyframes } from '@/types/keyframe'
import { useKeyframesStore } from '@/runtime/composition-runtime/deps/stores'
import { useStoreSelector } from '../../../use-sync-external-store.svelte'
import { useItemKeyframesFromContext } from '../../contexts/keyframes-context'

export function useRuntimeItemKeyframes(itemId: () => string): {
  readonly current: ItemKeyframes | undefined
} {
  const contextKeyframes = useItemKeyframesFromContext(itemId)
  const storeKeyframes = useStoreSelector(
    useKeyframesStore,
    (state) => state.keyframesByItemId[itemId()],
  )

  return {
    get current() {
      return contextKeyframes.current ?? storeKeyframes.current
    },
  }
}
