// A project on the server, made through the REST API (output.projectId).
const res = http.post(`${SERVER}/api/v1/projects`, {
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: NAME }),
})
if (res.status !== 201) throw new Error(`create project: ${res.status} ${res.body}`)
output.projectId = json(res.body).id
