// A task due today on the server, made through the REST API before the app signs in; with
// IN_PROJECT, in the project create-project.js made; with WITH_LABEL, carrying the label
// create-label.js made.
const d = new Date()
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const res = http.post(`${SERVER}/api/v1/tasks`, {
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: TITLE, due: { date: today }, project_id: typeof IN_PROJECT !== 'undefined' ? output.projectId : undefined, labels: typeof WITH_LABEL !== 'undefined' ? [output.labelId] : undefined }),
})
if (res.status !== 201) throw new Error(`create: ${res.status} ${res.body}`)
output.taskId = json(res.body).id
