package app.opentodo.container

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * The Android share sheet (native-app-handover, "Share into the app"): text, a link and
 * images shared to OpenTodo are copied into the queue, with files under the app's own
 * storage, and the app turns them into tasks. An intent is read once.
 */
object Shares {
    const val MAX_FILES = 10
    const val MAX_FILE_BYTES = 20L * 1024 * 1024
    const val MAX_TOTAL_BYTES = 25L * 1024 * 1024
    private const val MAX_TEXT = 10_000
    private const val HANDLED = "app.opentodo.share.handled"

    /** Queues the share [intent] carries; false when it is not a share or was read before. */
    fun capture(context: Context, intent: Intent?): Boolean {
        if (intent == null || intent.getBooleanExtra(HANDLED, false)) return false
        if (intent.action != Intent.ACTION_SEND && intent.action != Intent.ACTION_SEND_MULTIPLE) return false
        intent.putExtra(HANDLED, true)
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim()?.take(MAX_TEXT).orEmpty()
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim()?.take(500).orEmpty()
        val share = JSONObject().put("title", subject)
        // A lone link is a link; otherwise text (the app finds links inside text itself).
        if (Regex("""^https?://\S+$""").matches(text)) share.put("url", text).put("text", "") else share.put("url", "").put("text", text)
        val files = JSONArray()
        var total = 0L
        for (uri in streams(intent)) {
            if (files.length() >= MAX_FILES) break
            val copied = copy(context, uri, MAX_TOTAL_BYTES - total) ?: continue
            total += copied.optLong("size")
            files.put(copied)
        }
        share.put("files", files).put("at", System.currentTimeMillis())
        if (text.isEmpty() && subject.isEmpty() && files.length() == 0) return false
        Store(context).addShare(share)
        return true
    }

    @Suppress("DEPRECATION")
    private fun streams(intent: Intent): List<Uri> = when (intent.action) {
        Intent.ACTION_SEND_MULTIPLE -> if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty() else intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        else -> listOfNotNull(if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM))
    }

    /** A shared file by its path, only inside the app's files/shares. */
    fun file(context: Context, path: String): File? {
        val dir = File(context.filesDir, "shares").canonicalFile
        val f = File(path).canonicalFile
        return if (f.parentFile == dir && f.isFile) f else null
    }

    fun sha256(file: File): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) { val n = input.read(buf); if (n < 0) break; md.update(buf, 0, n) }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    /** The file at [uri] copied to the app's storage, or null when it is unreadable or over a limit. */
    private fun copy(context: Context, uri: Uri, room: Long): JSONObject? {
        val resolver = context.contentResolver
        var name = "shared"
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.let { name = it.take(200) }
        }
        val type = resolver.getType(uri) ?: "application/octet-stream"
        val dir = File(context.filesDir, "shares").apply { mkdirs() }
        val file = File(dir, UUID.randomUUID().toString())
        val limit = minOf(MAX_FILE_BYTES, room)
        return try {
            var size = 0L
            resolver.openInputStream(uri)?.use { input ->
                file.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        size += n
                        if (size > limit) throw IllegalStateException("over the limit")
                        out.write(buf, 0, n)
                    }
                }
            } ?: return null
            JSONObject().put("path", file.absolutePath).put("name", name).put("type", type).put("size", size)
        } catch (e: Exception) {
            file.delete()
            null
        }
    }
}
