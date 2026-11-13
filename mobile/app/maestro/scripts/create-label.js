// A label on the server (output.labelId), made through the REST API before the app signs in.
const res = http.post(`${SERVER}/api/v1/labels`, {
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: NAME }),
})
if (res.status !== 201) throw new Error(`label: ${res.status} ${res.body}`)
output.labelId = json(res.body).id
