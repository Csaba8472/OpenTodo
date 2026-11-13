package app.opentodo.container

import org.json.JSONObject

/** What the Today widget shows, built from the app's last snapshot only (native-shells D6). Pure for tests. */
data class WidgetModel(
    val updatedAt: Long,
    val locked: Boolean,
    val count: Int,
    val overdue: Int,
    val rows: List<Row>,
    val more: Int,
) {
    data class Row(val id: String, val title: String?, val time: String?, val priority: Int, val overdue: Boolean)

    /** Whether the widget says when the snapshot was made (native-app-handover D2): after an hour. */
    fun stale(now: Long): Boolean = now - updatedAt > STALE_MS

    companion object {
        const val ROWS = 5
        const val STALE_MS = 60L * 60 * 1000

        /** Null when nothing was published yet (or the snapshot is unreadable). Locked: counts, no titles. */
        fun parse(json: String?): WidgetModel? {
            if (json.isNullOrEmpty()) return null
            val o = try { JSONObject(json) } catch (e: Exception) { return null }
            val locked = o.optBoolean("locked", false)
            val tasks = o.optJSONArray("tasks")
            val all = ArrayList<Row>()
            if (!locked && tasks != null) for (i in 0 until tasks.length()) {
                val t = tasks.optJSONObject(i) ?: continue
                val title = if (t.isNull("title")) null else t.optString("title").take(200).ifEmpty { null }
                val time = if (t.isNull("time")) null else t.optString("time").takeIf { Regex("""\d\d:\d\d""").matches(it) }
                all += Row(t.optString("id"), title, time, t.optInt("priority", 4).coerceIn(1, 4), t.optBoolean("overdue", false))
            }
            val count = o.optInt("count", all.size).coerceAtLeast(0)
            return WidgetModel(
                updatedAt = o.optLong("updatedAt", 0),
                locked = locked,
                count = count,
                overdue = o.optInt("overdue", 0).coerceAtLeast(0),
                rows = all.take(ROWS),
                more = (count - all.take(ROWS).size).coerceAtLeast(0),
            )
        }
    }
}
