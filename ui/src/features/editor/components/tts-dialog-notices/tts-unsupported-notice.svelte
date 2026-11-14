<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import type { StoredTtsEngine } from '@/shared/utils/tts-settings'
  import {
    resolveTtsUnsupportedMessage,
    type TtsTranslate,
  } from '@/features/editor/utils/tts-generate-options'
  import { i18n, locale } from '$lib/i18n.svelte'

  /** Amber banner shown when the selected engine cannot run in this browser. */
  let { engine }: { engine: StoredTtsEngine } = $props()

  const message = $derived.by(() => {
    void locale.current
    return resolveTtsUnsupportedMessage(engine, i18n.t.bind(i18n) as TtsTranslate)
  })
</script>

<div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
  {message}
</div>
