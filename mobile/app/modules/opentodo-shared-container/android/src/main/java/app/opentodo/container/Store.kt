package app.opentodo.container

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

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

    fun takeActions(): String = take("actions")

    /** Shares received since the app last read them: `[{title, text, url, files: [{path, name, type}]}]`. */
    fun addShare(share: JSONObject) = append("shares", share)

    fun takeShares(): String = take("shares")

    fun clear() {
        p.edit().clear().commit()
    }

    @Synchronized
    private fun append(key: String, item: JSONObject) {
        val list = try { JSONArray(p.getString(key, "[]")) } catch (e: Exception) { JSONArray() }
        // A queue nobody drains stays bounded: the oldest entries go first.
        while (list.length() >= MAX_QUEUE) list.remove(0)
        list.put(item)
        p.edit().putString(key, list.toString()).commit()
    }

    @Synchronized
    private fun take(key: String): String {
        val out = p.getString(key, "[]") ?: "[]"
        p.edit().remove(key).commit()
        return out
    }

    companion object {
        const val MAX_QUEUE = 100

        /** The server address the web-view shell stored (its `opentodo` preferences), read once at the switch. */
        fun shellServer(context: Context): String? =
            context.applicationContext.getSharedPreferences("opentodo", Context.MODE_PRIVATE).getString("server", null)
    }
}
