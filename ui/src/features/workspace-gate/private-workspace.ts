// SPDX-License-Identifier: MIT

/**
 * The workspace where the browser can't open a folder (Firefox): the origin's
 * private storage. It opens without a splash; the first time, a notice says
 * where projects live and offers to make the storage persistent, since
 * best-effort storage is capped low and evicted under disk pressure.
 */

import { toast } from 'svelte-sonner'
import { createLogger } from '@/shared/logging/logger'
import {
  isStoragePersisted,
  openPrivateWorkspace,
  requestStoragePersistence,
} from '@/infrastructure/storage/workspace-fs/private-workspace'
import { t } from '$lib/i18n.svelte'

const logger = createLogger('PrivateWorkspace')

const NOTICE_SEEN_KEY = 'embeddablecut:private-workspace-notice'

/** The private workspace, or `null` where the browser refuses it (private windows). */
export async function openPrivateWorkspaceFallback(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await openPrivateWorkspace()
  } catch (error) {
    logger.warn('Private storage is unavailable', error)
    return null
  }
}

function noticeSeen(): boolean {
  try {
    return localStorage.getItem(NOTICE_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markNoticeSeen(): void {
  try {
    localStorage.setItem(NOTICE_SEEN_KEY, '1')
  } catch {
    // A storage-less window just sees the notice again.
  }
}

export async function showPrivateWorkspaceNotice(): Promise<void> {
  if (noticeSeen() || (await isStoragePersisted()) === true) return
  toast.info(t('browserSupport.privateWorkspace.title'), {
    description: t('browserSupport.privateWorkspace.description'),
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: t('browserSupport.privateWorkspace.keep'),
      onClick: () => {
        markNoticeSeen()
        void requestStoragePersistence().then((persisted) => {
          if (!persisted) toast.warning(t('browserSupport.privateWorkspace.notPersisted'))
        })
      },
    },
    onDismiss: markNoticeSeen,
  })
}
