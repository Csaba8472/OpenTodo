// node --test mobile/app/scripts/google-services.test.mjs (make app)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { googleServices } from './google-services.mjs'

const tree = `
releaseRuntimeClasspath - Resolved configuration for runtime for variant: release
+--- project :expo
|    +--- androidx.work:work-runtime-ktx:2.10.5
|    |    \\--- androidx.room:room-ktx:2.6.1
+--- project :expo-notifications
|    +--- com.google.firebase:firebase-messaging:24.1.0
|    |    +--- com.google.android.gms:play-services-base:18.5.0 -> 18.6.0
|    |    \\--- com.google.firebase:firebase-messaging:24.1.0 (*)
\\--- com.google.android.material:material:1.12.0
`

test('names Firebase and Play Services, each once', () => {
  assert.deepEqual(googleServices(tree), ['com.google.android.gms:play-services-base', 'com.google.firebase:firebase-messaging'])
})

test('lets AndroidX and Material through', () => {
  assert.deepEqual(googleServices('+--- androidx.core:core-ktx:1.16.0\n\\--- com.google.android.material:material:1.12.0\n'), [])
})
