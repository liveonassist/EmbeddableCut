<!-- SPDX-License-Identifier: MIT -->
<!--
  Invisible side-effect component: warms the turbores decoder for an upcoming ProRes clip
  during the premount window. ProRes can't decode through a `<video>` element, so the
  preview canvas only mounts (and cold-starts its decoder) when the clip goes active —
  crossing into it during playback then shows black until the ~100ms worker spawn +
  first decode complete. Holding a warm sink lease here (and decoding one frame) ahead of
  time means the active canvas reuses the warm decoder and paints within a frame. Renders
  nothing, so it never shows the clip's start frame during premount.
-->
<script lang="ts">
  import { acquireProResSession } from '@/infrastructure/browser/prores-sink-cache'

  let props: { src: string } = $props()
  const src = $derived(props.src)

  $effect(() => {
    let cancelled = false
    const lease = acquireProResSession(src)
    void lease.session
      .then((session) => {
        if (cancelled || !session) return
        // Decode one frame so the decoder worker pool is fully warm before the active
        // canvas requests the entering frame. The sample is borrowed (owned by the shared
        // session), so we don't close it here.
        return session.getSampleForTime(0)
      })
      .catch(() => {
        // Best-effort; the active canvas surfaces real open/decode failures.
      })
    return () => {
      cancelled = true
      lease.release()
    }
  })
</script>
