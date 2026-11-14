<!-- SPDX-License-Identifier: MIT -->
<script lang="ts">
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '.'

  let {
    open = $bindable(true),
    onAction,
  }: { open?: boolean; onAction?: (event: MouseEvent) => void } = $props()
</script>

<AlertDialog bind:open>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Bake motion?</AlertDialogTitle>
      <AlertDialogDescription>Keyframes replace the generator.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onclick={onAction}>Bake</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

<output data-testid="state">{open ? 'open' : 'closed'}</output>
