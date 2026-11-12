// The task titled TITLE on the server, waiting up to 15 s for the app's op to arrive
// (output.task). With PROJECT, its project must have that name.
const deadline = Date.now() + 15000
let found = null
while (Date.now() < deadline && !found) {
  const res = http.get(`${SERVER}/api/v1/tasks`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  found = json(res.body).tasks.find((t) => t.title === TITLE && !t.deleted_at) || null
}
if (!found) throw new Error(`no task "${TITLE}" on the server`)
output.task = found
