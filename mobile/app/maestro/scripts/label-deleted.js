// The label create-label.js made is deleted on the server and the task create-task.js made
// (with WITH_LABEL) no longer carries it, but is still there. Waits up to 15 s for the sync.
// The server answers 404 for a deleted label.
const deadline = Date.now() + 15000
let gone = false
let task = null
while (Date.now() < deadline) {
  gone = http.get(`${SERVER}/api/v1/labels/${output.labelId}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).status === 404
  task = json(http.get(`${SERVER}/api/v1/tasks/${output.taskId}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).body)
  if (gone && !task.deleted_at && !(task.labels || []).includes(output.labelId)) break
}
if (!gone) throw new Error('the label is not deleted on the server')
if (task.deleted_at || (task.labels || []).includes(output.labelId)) throw new Error(`the task: ${JSON.stringify(task)}`)
