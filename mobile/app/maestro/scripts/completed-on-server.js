// The server has the task completed: the app's op arrived. Asks again for up to 15 s
// (the app sends a quarter of a second after the write, then retries with backoff).
const deadline = Date.now() + 15000
let completed = null
while (Date.now() < deadline) {
  const res = http.get(`${SERVER}/api/v1/tasks/${output.taskId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  completed = json(res.body).completed_at
  if (completed) break
}
if (!completed) throw new Error('the task is not completed on the server')
