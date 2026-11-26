<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import FolderOpen from '@lucide/svelte/icons/folder-open'
  import FolderX from '@lucide/svelte/icons/folder-x'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import BookOpen from '@lucide/svelte/icons/book-open'
  import { Button } from '@/components/ui/button'
  import EmbeddableCutLogo from '@/components/brand/embeddablecut-logo.svelte'
  import Trans from '@/components/trans.svelte'
  import { t } from '$lib/i18n.svelte'
  import type { SplashStatus } from './types'

  interface Props {
    status: SplashStatus
    error?: string | null
    onPickFolder: () => void
    onReconnect: () => void
  }

  let { status, error, onPickFolder, onReconnect }: Props = $props()
</script>

<div class="min-h-screen bg-background flex items-center justify-center px-6">
  <div class="max-w-lg w-full text-center">
    <EmbeddableCutLogo variant="full" size="lg" class="justify-center mb-8" />

    {#if error}
      <div
        class="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-left text-sm text-destructive flex gap-2"
      >
        <AlertTriangle class="h-4 w-4 mt-0.5 shrink-0" />
        <span>{error}</span>
      </div>
    {/if}

    {#if status.kind === 'initializing'}
      <div class="flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        {t('common.loading')}
      </div>
    {/if}

    {#if status.kind === 'unavailable'}
      <div class="space-y-3">
        <div class="flex items-center justify-center gap-2 text-destructive">
          <FolderX class="h-5 w-5" />
          <span class="font-medium">{t('projects.workspaceGate.unsupportedBrowser')}</span>
        </div>
        <p class="text-sm text-muted-foreground">
          {t('projects.workspaceGate.unsupportedBrowserDescription')}
        </p>
        <Button variant="outline" size="sm" class="gap-2">
          {#snippet child({ props })}
            <a {...props} href="/docs/workspaces">
              <BookOpen class="h-4 w-4" />
              {t('projects.workspaceGate.workspaceGuide')}
            </a>
          {/snippet}
        </Button>
      </div>
    {/if}

    {#if status.kind === 'pick'}
      <div class="space-y-5">
        <div>
          <h1 class="text-2xl font-semibold mb-2">
            {t('projects.workspaceGate.pickTitle')}
          </h1>
          <p class="text-sm text-muted-foreground">
            {t('projects.workspaceGate.pickDescription')}
          </p>
        </div>
        <div class="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Button size="lg" class="gap-2" onclick={onPickFolder}>
            <FolderOpen class="h-4 w-4" />
            {t('projects.workspaceGate.chooseFolder')}
          </Button>
          <Button variant="outline" size="lg" class="gap-2">
            {#snippet child({ props })}
              <a {...props} href="/docs/workspaces">
                <BookOpen class="h-4 w-4" />
                {t('projects.workspaceGate.workspaceGuide')}
              </a>
            {/snippet}
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">{t('projects.workspaceGate.pickTip')}</p>
      </div>
    {/if}

    {#if status.kind === 'reconnect'}
      <div class="space-y-5">
        <div>
          <h1 class="text-2xl font-semibold mb-2">
            {t('projects.workspaceGate.reconnectTitle')}
          </h1>
          <p class="text-sm text-muted-foreground">
            <Trans
              i18nKey="projects.workspaceGate.reconnectDescription"
              values={{ name: status.handleName }}
            >
              {#snippet code(text: string)}<span class="font-mono">{text}</span>{/snippet}
            </Trans>
          </p>
        </div>
        <div class="flex items-center justify-center gap-2">
          <Button variant="outline" size="lg" class="gap-2" onclick={onPickFolder}>
            <FolderOpen class="h-4 w-4" />
            {t('projects.workspaceGate.chooseDifferentFolder')}
          </Button>
          <Button size="lg" class="gap-2" onclick={onReconnect}>
            <RefreshCw class="h-4 w-4" />
            {t('projects.workspaceGate.reconnect')}
          </Button>
        </div>
        <Button variant="ghost" size="sm" class="gap-2">
          {#snippet child({ props })}
            <a {...props} href="/docs/workspaces">
              <BookOpen class="h-4 w-4" />
              {t('projects.workspaceGate.workspaceGuide')}
            </a>
          {/snippet}
        </Button>
      </div>
    {/if}
  </div>
</div>
