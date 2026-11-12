// The task renamed on the server, as another device would (native-app "Change from the web").
const res = http.request(`${SERVER}/api/v1/tasks/${output.taskId}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: TITLE }),
})
if (res.status !== 200) throw new Error(`rename: ${res.status} ${res.body}`)
