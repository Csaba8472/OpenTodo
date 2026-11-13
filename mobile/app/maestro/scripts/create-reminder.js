// A reminder of the task create-task.js made, firing IN_SECONDS from now.
const res = http.post(`${SERVER}/api/v1/reminders`, {
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ task_id: output.taskId, kind: 'absolute', fire_at: Date.now() + Number(IN_SECONDS) * 1000 }),
})
if (res.status !== 201) throw new Error(`reminder: ${res.status} ${res.body}`)
