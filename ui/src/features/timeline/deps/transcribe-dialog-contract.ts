// SPDX-License-Identifier: MIT

import type { ComponentProps } from 'svelte'
import TranscribeDialog from '@/features/media-library/components/transcribe-dialog.svelte'

export { TranscribeDialog }
export type TranscribeDialogValues = Parameters<
  ComponentProps<typeof TranscribeDialog>['onStart']
>[0]
