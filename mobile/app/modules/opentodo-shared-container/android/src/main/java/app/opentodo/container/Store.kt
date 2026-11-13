package app.opentodo.container

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * The shared container on Android (native-app-handover D1): what the app hands to the
 * widget, the alarms and the notification buttons, and what they and the share sheet hand
 * back. App-private SharedPreferences, never backed up.
 */
class Store(context: Context) {
    private val p: SharedPreferences = context.applicationContext.getSharedPreferences("opentodo-container", Context.MODE_PRIVATE)

    var widget: String?
        get() = p.getString("widget", null)
        set(v) = p.edit().putString("widget", v).apply()

    var reminders: String
        get() = p.getString("reminders", "[]") ?: "[]"
        set(v) = p.edit().putString("reminders", v).apply()

    /** Notification buttons pressed since the app last read them: `[{id, action, at}]`. */
    fun addAction(id: String, action: String, at: Long) = append("actions", JSONObject().put("id", id).put("action", action).put("at", at))

    fun takeActions(): String = synchronized(queueLock) { p.getString("actions", "[]") ?: "[]" }

    fun ackAction(id: String, at: Long) = synchronized(queueLock) {
        val list = JSONArray(takeActions())
        for (i in list.length() - 1 downTo 0) {
            val item = list.getJSONObject(i)
            if (item.optString("id") == id && item.optLong("at") == at) list.remove(i)
        }
        p.edit().putString("actions", list.toString()).commit()
        Unit
    }

    /** Shares received since the app last read them: `[{title, text, url, files: [{path, name, type}]}]`. */
    fun addShare(share: JSONObject) = append("shares", share.put("id", UUID.randomUUID().toString()))

    fun takeShares(): String = synchronized(queueLock) {
        val list = try { JSONArray(p.getString("shares", "[]")) } catch (e: Exception) { JSONArray() }
        for (i in 0 until list.length()) {
            val share = list.getJSONObject(i)
            if (!share.has("id")) share.put("id", UUID.randomUUID().toString())
        }
        p.edit().putString("shares", list.toString()).commit()
        list.toString()
    }

    fun ackShare(id: String) = synchronized(queueLock) {
        val list = JSONArray(takeShares())
        for (i in list.length() - 1 downTo 0) if (list.getJSONObject(i).optString("id") == id) list.remove(i)
        p.edit().putString("shares", list.toString()).commit()
    }

    fun clear() = synchronized(queueLock) {
        p.edit().clear().commit()
    }

    private fun append(key: String, item: JSONObject) = synchronized(queueLock) {
        val list = try { JSONArray(p.getString(key, "[]")) } catch (e: Exception) { JSONArray() }
        // A queue nobody drains stays bounded: the oldest entries go first.
        while (list.length() >= MAX_QUEUE) list.remove(0)
        list.put(item)
        p.edit().putString(key, list.toString()).commit()
    }

    companion object {
        private val queueLock = Any()
        const val MAX_QUEUE = 100

        /** The server address the web-view shell stored (its `opentodo` preferences), read once at the switch. */
        fun shellServer(context: Context): String? =
            context.applicationContext.getSharedPreferences("opentodo", Context.MODE_PRIVATE).getString("server", null)
    }
}
