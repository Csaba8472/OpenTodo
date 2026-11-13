package app.opentodo.container

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/** One reminder the app scheduled (deviceSnapshot.ts `ShellReminder`). */
data class DeviceReminder(val id: String, val taskId: String, val fireAt: Long, val title: String?)

/** Parsing and filtering of the schedule; pure so the rules are unit-tested. */
object ReminderSchedule {
    const val HORIZON_MS = 8L * 24 * 60 * 60 * 1000
    const val MAX = 500
    const val SNOOZE_MS = 10L * 60 * 1000
    private const val GRACE_MS = 60_000L

    /** Complete and Snooze 10 min (native-app-handover D3). */
    val ACTIONS = listOf("done", "snooze")

    fun isAction(action: String?): Boolean = action in ACTIONS

    /**
     * The reminders to arm: valid entries, firing from a minute ago (a late schedule still
     * fires) to the horizon, one per id, at most [MAX], earliest first. Bad JSON is an empty list.
     * With [now] null there is no time window: the stored schedule as it was armed.
     */
    fun parse(json: String, now: Long?): List<DeviceReminder> {
        val arr = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
        val seen = HashSet<String>()
        val out = ArrayList<DeviceReminder>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val id = o.optString("id")
            val taskId = o.optString("taskId")
            val fireAt = o.optLong("fireAt", -1)
            if (id.isEmpty() || id.length > 100 || taskId.isEmpty() || taskId.length > 100 || fireAt < 0) continue
            if (now != null && (fireAt < now - GRACE_MS || fireAt > now + HORIZON_MS)) continue
            if (!seen.add(id)) continue
            val title = if (o.has("title") && !o.isNull("title")) o.optString("title").take(200).ifEmpty { null } else null
            out.add(DeviceReminder(id, taskId, fireAt, title))
        }
        return out.sortedBy { it.fireAt }.take(MAX)
    }

    fun toJson(list: List<DeviceReminder>): String {
        val arr = JSONArray()
        for (r in list) arr.put(JSONObject().apply {
            put("id", r.id); put("taskId", r.taskId); put("fireAt", r.fireAt)
            if (r.title != null) put("title", r.title)
        })
        return arr.toString()
    }

    /** The schedule with [id] moved to [fireAt] (a snooze armed before the app writes its op). */
    fun moved(list: List<DeviceReminder>, id: String, fireAt: Long): List<DeviceReminder> =
        list.map { if (it.id == id) it.copy(fireAt = fireAt) else it }.sortedBy { it.fireAt }
}

/** Arms one alarm per scheduled reminder (exact when allowed, inexact otherwise). */
object Scheduler {
    private fun alarmIntent(context: Context, id: String): PendingIntent {
        val intent = Intent(context, AlarmReceiver::class.java).setData(Uri.parse("opentodo-reminder:" + Uri.encode(id)))
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun canExact(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || context.getSystemService(AlarmManager::class.java).canScheduleExactAlarms()

    fun notificationsAllowed(context: Context): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(context).areNotificationsEnabled()

    /** Replaces the stored schedule and the armed alarms with [json]. */
    fun replace(context: Context, json: String) {
        val store = Store(context)
        cancelAll(context, store)
        val list = ReminderSchedule.parse(json, System.currentTimeMillis())
        store.reminders = ReminderSchedule.toJson(list)
        arm(context, list)
    }

    /** Re-arms the stored schedule (after a reboot or a change of the exact-alarm permission). */
    fun rearm(context: Context) {
        arm(context, ReminderSchedule.parse(Store(context).reminders, System.currentTimeMillis()))
    }

    /** Fires [id] again in ten minutes, before the app has written the snooze's op. */
    fun snooze(context: Context, id: String, now: Long) {
        val store = Store(context)
        val list = ReminderSchedule.moved(ReminderSchedule.parse(store.reminders, null), id, now + ReminderSchedule.SNOOZE_MS)
        store.reminders = ReminderSchedule.toJson(list)
        list.firstOrNull { it.id == id }?.let { arm(context, listOf(it)) }
    }

    fun clear(context: Context) {
        val store = Store(context)
        cancelAll(context, store)
        store.reminders = "[]"
    }

    private fun cancelAll(context: Context, store: Store) {
        val am = context.getSystemService(AlarmManager::class.java)
        for (r in ReminderSchedule.parse(store.reminders, null)) am.cancel(alarmIntent(context, r.id))
    }

    private fun arm(context: Context, list: List<DeviceReminder>, exact: Boolean = canExact(context)) {
        val am = context.getSystemService(AlarmManager::class.java)
        for (r in list) {
            val pi = alarmIntent(context, r.id)
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.fireAt, pi)
        }
    }

    fun find(context: Context, id: String): DeviceReminder? =
        ReminderSchedule.parse(Store(context).reminders, null).firstOrNull { it.id == id }
}

/** Shows the notifications: a reminder, and an in-app notification found by a background refresh. */
object Notifier {
    private const val REMINDERS = "reminders"
    private const val NOTIFICATIONS = "notifications"

    private fun channels(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(REMINDERS, context.getString(R.string.ot_channel_reminders), NotificationManager.IMPORTANCE_HIGH))
        nm.createNotificationChannel(NotificationChannel(NOTIFICATIONS, context.getString(R.string.ot_channel_notifications), NotificationManager.IMPORTANCE_DEFAULT))
    }

    private fun action(context: Context, id: String, action: String): PendingIntent {
        val intent = Intent(context, NotificationActionReceiver::class.java)
            .setData(Uri.parse("opentodo-action:" + Uri.encode(id) + "?" + action))
            .putExtra("id", id).putExtra("action", action)
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun label(action: String): Int = if (action == "done") R.string.ot_action_done else R.string.ot_action_snooze

    fun notificationId(id: String): Int = id.hashCode()

    fun reminder(context: Context, r: DeviceReminder): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        channels(context)
        val b = NotificationCompat.Builder(context, REMINDERS)
            .setSmallIcon(R.drawable.ot_ic_notification)
            .setContentTitle(r.title ?: context.getString(R.string.ot_reminder_generic))
            .setContentText(context.getString(R.string.ot_reminder_text))
            .setWhen(r.fireAt).setShowWhen(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(WidgetStore.open(context, WidgetStore.taskPath(r.taskId), notificationId(r.id)))
        for (a in ReminderSchedule.ACTIONS) b.addAction(0, context.getString(label(a)), action(context, r.id, a))
        return try { NotificationManagerCompat.from(context).notify(notificationId(r.id), b.build()); true } catch (e: SecurityException) { false }
    }

    /** `{id, title, body, taskId?}`: a mention or an assignment, written by the app in the user's language. */
    fun inApp(context: Context, json: String): Boolean {
        if (!Scheduler.notificationsAllowed(context)) return false
        val o = try { JSONObject(json) } catch (e: Exception) { return false }
        val id = o.optString("id").ifEmpty { return false }
        channels(context)
        val task = o.optString("taskId").ifEmpty { null }
        val b = NotificationCompat.Builder(context, NOTIFICATIONS)
            .setSmallIcon(R.drawable.ot_ic_notification)
            .setContentTitle(o.optString("title").take(200))
            .setContentText(o.optString("body").take(500))
            .setAutoCancel(true)
            .setContentIntent(WidgetStore.open(context, if (task != null) WidgetStore.taskPath(task) else "today", notificationId(id)))
        return try { NotificationManagerCompat.from(context).notify(notificationId(id), b.build()); true } catch (e: SecurityException) { false }
    }
}

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.data?.schemeSpecificPart ?: return
        val r = Scheduler.find(context, id) ?: return
        Notifier.reminder(context, r)
    }
}

/**
 * Complete and Snooze 10 min: queued for the app, which writes them as ops through mutate()
 * in the background (Background.run) and sends them at the next sync. A snooze is armed
 * here at once, so it fires even before the app has run.
 */
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val action = intent.getStringExtra("action")?.takeIf { ReminderSchedule.isAction(it) } ?: return
        if (Scheduler.find(context, id) == null) return
        val now = System.currentTimeMillis()
        NotificationManagerCompat.from(context).cancel(Notifier.notificationId(id))
        if (action == "snooze") Scheduler.snooze(context, id, now)
        Store(context).addAction(id, action, now)
        Background.run(context, Background.ACTION_TASK)
    }
}

/** Alarms do not survive a reboot or a change of the exact-alarm permission: arm them again. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED -> Scheduler.rearm(context)
        }
    }
}
