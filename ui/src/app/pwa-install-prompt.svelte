<!-- SPDX-License-Identifier: MIT -->
<script lang="ts" module>
  const INSTALL_DISMISSED_UNTIL_KEY = 'freecut-pwa-install-dismissed-until'
  const INSTALL_DISMISS_MS = 7 * 24 * 60 * 60 * 1000

  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  }

  function isStandaloneDisplayMode() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  }

  function isDismissed() {
    const dismissedUntil = Number(window.localStorage.getItem(INSTALL_DISMISSED_UNTIL_KEY) ?? 0)
    return Number.isFinite(dismissedUntil) && dismissedUntil > Date.now()
  }
</script>

<script lang="ts">
  import Download from 'lucide-svelte/icons/download'
  import X from 'lucide-svelte/icons/x'
  import { Button } from '@/components/ui/button'
  import { t } from '$lib/i18n.svelte'

  let installPrompt = $state.raw<BeforeInstallPromptEvent | null>(null)
  let visible = $state(false)

  $effect(() => {
    if (isStandaloneDisplayMode()) {
      return
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()

      if (isDismissed()) {
        return
      }

      installPrompt = event as BeforeInstallPromptEvent
      visible = true
    }

    const handleAppInstalled = () => {
      window.localStorage.removeItem(INSTALL_DISMISSED_UNTIL_KEY)
      visible = false
      installPrompt = null
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  })

  function dismiss() {
    window.localStorage.setItem(INSTALL_DISMISSED_UNTIL_KEY, String(Date.now() + INSTALL_DISMISS_MS))
    visible = false
  }

  async function install() {
    const prompt = installPrompt
    if (!prompt) {
      return
    }

    visible = false
    await prompt.prompt()
    const choice = await prompt.userChoice

    if (choice.outcome === 'dismissed') {
      dismiss()
    } else {
      window.localStorage.removeItem(INSTALL_DISMISSED_UNTIL_KEY)
    }

    installPrompt = null
  }
</script>

{#if visible && installPrompt}
  <aside
    aria-label={t('appShell.installPrompt.label')}
    class="fixed bottom-4 left-4 z-50 w-[min(calc(100vw-2rem),360px)] rounded-lg border border-border bg-background/95 p-3 text-foreground shadow-lg backdrop-blur"
  >
    <div class="flex items-start gap-3">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
      >
        <Download class="h-4 w-4" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium leading-5">{t('appShell.installPrompt.title')}</div>
        <div class="mt-0.5 text-xs leading-5 text-muted-foreground">
          {t('appShell.installPrompt.description')}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button size="sm" class="h-8" onclick={() => void install()}>
            <Download class="h-3.5 w-3.5" />
            {t('appShell.installPrompt.install')}
          </Button>
          <Button size="sm" variant="ghost" class="h-8" onclick={dismiss}>
            {t('appShell.installPrompt.notNow')}
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label={t('appShell.installPrompt.dismiss')}
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        onclick={dismiss}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </aside>
{/if}
