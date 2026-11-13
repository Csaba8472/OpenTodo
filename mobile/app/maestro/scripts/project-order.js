// Waits up to 15 s until the open tasks of the project create-project.js made are, by
// position on the server, in ORDER (titles separated by commas).
const deadline = Date.now() + 15000
let titles = []
while (Date.now() < deadline && titles.join(',') !== ORDER) {
  const tasks = json(http.get(`${SERVER}/api/v1/tasks`, { headers: { Authorization: `Bearer ${TOKEN}` } }).body).tasks
  titles = tasks.filter((t) => t.project_id === output.projectId && !t.deleted_at && !t.completed_at)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)).map((t) => t.title)
}
if (titles.join(',') !== ORDER) throw new Error(`the project's order is ${titles.join(',')}, not ${ORDER}`)
