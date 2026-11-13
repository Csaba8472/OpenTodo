// The notice of the web-view shells' last release (native-app-handover D7): shown once,
// after everything this device changed has reached the server (lib/shellHandover.ts).
import { useEffect, useState } from 'react'
import { Button, Dialog } from '../ui'
import { t } from '../lib/i18n'
import { handoverDue, handoverShown } from '../lib/shellHandover'

export function ShellHandover() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    void handoverDue().then((due) => { if (live && due) setOpen(true) })
    return () => { live = false }
  }, [])
  if (!open) return null
  const close = () => { setOpen(false); void handoverShown() }
  return (
    <Dialog title={t('The next update is the new OpenTodo app')} onClose={close} size="sm" testId="shell-handover">
      <p className="text-body text-muted">{t('Everything you changed here is on your server. After the update, sign in once more and your tasks are there.')}</p>
      <div className="mt-4 flex justify-end"><Button variant="primary" onClick={close}>{t('OK')}</Button></div>
    </Dialog>
  )
}
