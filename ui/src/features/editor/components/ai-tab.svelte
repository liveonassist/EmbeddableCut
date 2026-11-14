<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import AiPanel from './ai-panel.svelte'

  /**
   * Container for the AI sidebar tab. The on-device assistant (agent that edits
   * the timeline) is hidden for now while it's still in progress — only the
   * generation tools (TTS / music) are exposed. To restore the agent, bring back
   * the segmented Assistant/Generate switcher and render `AgentChatPanel`.
   */
</script>

<div class="flex h-full min-h-0 flex-col">
  <div class="min-h-0 flex-1 overflow-hidden">
    <AiPanel />
  </div>
</div>
