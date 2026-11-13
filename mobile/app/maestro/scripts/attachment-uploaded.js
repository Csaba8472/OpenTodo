// The task find-task.js found (output.task) has an attachment whose bytes reached the
// server. Asks again for up to 30 s: the app uploads once its row has synced.
const deadline = Date.now() + 30000
let list = []
while (Date.now() < deadline) {
  const res = http.get(`${SERVER}/api/v1/tasks/${output.task.id}/attachments`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  list = json(res.body).attachments || []
  if (list.some((a) => a.uploaded)) break
}
if (!list.some((a) => a.uploaded)) throw new Error(`no uploaded attachment: ${JSON.stringify(list)}`)
