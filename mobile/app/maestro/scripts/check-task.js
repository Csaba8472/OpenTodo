// Waits up to 15 s until the server's task (output.taskId, or output.task.id) satisfies
// CHECK, a JavaScript expression over `t`.
const id = output.taskId || output.task.id
const deadline = Date.now() + 15000
let t = null
let ok = false
while (Date.now() < deadline && !ok) {
  t = json(http.get(`${SERVER}/api/v1/tasks/${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } }).body)
  ok = eval(CHECK)
}
if (!ok) throw new Error(`the task does not satisfy ${CHECK}: ${JSON.stringify(t)}`)
