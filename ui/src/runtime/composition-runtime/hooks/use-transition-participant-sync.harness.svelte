<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    useTransitionParticipantSync,
    type TransitionSyncParticipant,
  } from './use-transition-participant-sync.svelte'

  let {
    participants,
    groupMinFrom,
    timelineFps,
  }: {
    participants: TransitionSyncParticipant[]
    groupMinFrom: number
    timelineFps: number
  } = $props()

  useTransitionParticipantSync(
    () => participants,
    () => groupMinFrom,
    () => timelineFps,
  )
</script>
