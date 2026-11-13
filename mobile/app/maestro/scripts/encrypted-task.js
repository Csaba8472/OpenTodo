// Waits up to 15 s for a task the app wrote on the encrypted account: the server holds its
// title only as ciphertext (enc:v1:…), never as text.
const deadline = Date.now() + 15000
let found = null
let tasks = []
while (Date.now() < deadline && !found) {
  tasks = json(http.get(`${SERVER}/api/v1/tasks`, { headers: { Authorization: `Bearer ${TOKEN}` } }).body).tasks
  found = tasks.find((t) => !t.deleted_at && String(t.title).startsWith('enc:v1:')) || null
}
if (!found) throw new Error(`no encrypted task on the server: ${JSON.stringify(tasks.map((t) => t.title))}`)
if (tasks.some((t) => t.title === TITLE)) throw new Error(`"${TITLE}" reached the server as text`)
