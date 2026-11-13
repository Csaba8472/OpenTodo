package app.opentodo.container

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews

/** Stores the app's snapshot and redraws the widgets; the widgets never request anything themselves. */
object WidgetStore {
    fun publish(context: Context, json: String) {
        if (json.length > 512 * 1024 || WidgetModel.parse(json) == null) return
        Store(context).widget = json
        redraw(context)
    }

    fun redraw(context: Context) {
        val m = AppWidgetManager.getInstance(context)
        val ids = m.getAppWidgetIds(ComponentName(context, TodayWidget::class.java))
        if (ids.isNotEmpty()) TodayWidget.draw(context, m, ids)
    }

    /** Opens the app at `opentodo://<path>` (a task, or the capture sheet). */
    fun open(context: Context, path: String, code: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("opentodo://$path")).setPackage(context.packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun taskPath(taskId: String): String = "task/" + Uri.encode(taskId)

    const val ADD_PATH = "add"
}

class TodayWidget : AppWidgetProvider() {
    // Also every 30 minutes (updatePeriodMillis), so an old snapshot comes to say its time.
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = draw(context, manager, ids)

    companion object {
        /** The colour resource a row sets over its layout colour, or null to keep the day/night text colour. */
        fun rowColor(overdue: Boolean): Int? = if (overdue) R.color.ot_overdue else null

        private val ROW_IDS = intArrayOf(R.id.row0, R.id.row1, R.id.row2, R.id.row3, R.id.row4)

        fun draw(context: Context, manager: AppWidgetManager, ids: IntArray) {
            val model = WidgetModel.parse(Store(context).widget)
            val v = RemoteViews(context.packageName, R.layout.ot_widget_today)
            v.setOnClickPendingIntent(R.id.header, WidgetStore.open(context, "today", 100))
            v.setTextViewText(R.id.count, model?.count?.toString() ?: "")
            val stale = model != null && model.stale(System.currentTimeMillis())
            v.setTextViewText(R.id.updated, if (stale) context.getString(R.string.ot_widget_updated, DateFormat.getTimeFormat(context).format(model!!.updatedAt)) else "")
            v.setViewVisibility(R.id.updated, if (stale) View.VISIBLE else View.GONE)
            val message = when {
                model == null -> context.getString(R.string.ot_widget_open_app)
                model.locked -> context.getString(R.string.ot_widget_locked, model.count, model.overdue)
                model.count == 0 -> context.getString(R.string.ot_widget_empty)
                else -> null
            }
            v.setTextViewText(R.id.message, message ?: "")
            v.setViewVisibility(R.id.message, if (message == null) View.GONE else View.VISIBLE)
            for ((i, rowId) in ROW_IDS.withIndex()) {
                val row = model?.rows?.getOrNull(i)
                if (row == null) { v.setViewVisibility(rowId, View.GONE); continue }
                val title = row.title ?: context.getString(R.string.ot_widget_untitled)
                v.setTextViewText(rowId, if (row.time != null) "${row.time}  $title" else title)
                // A plain row keeps its layout colour so the launcher resolves it for the current
                // theme; context.getColor here would bake in the colour of the moment (#966).
                rowColor(row.overdue)?.let { color ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) v.setColorStateList(rowId, "setTextColor", color)
                    else v.setTextColor(rowId, context.getColor(color))
                }
                v.setViewVisibility(rowId, View.VISIBLE)
                v.setOnClickPendingIntent(rowId, WidgetStore.open(context, WidgetStore.taskPath(row.id), 101 + i))
            }
            val more = model?.more ?: 0
            v.setTextViewText(R.id.more, context.getString(R.string.ot_widget_more, more))
            v.setViewVisibility(R.id.more, if (model != null && !model.locked && more > 0) View.VISIBLE else View.GONE)
            manager.updateAppWidget(ids, v)
        }
    }
}

/** Android widgets hold no text field: the button opens the capture sheet. */
class QuickAddWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        val v = RemoteViews(context.packageName, R.layout.ot_widget_quick_add)
        v.setOnClickPendingIntent(R.id.quick_add, WidgetStore.open(context, WidgetStore.ADD_PATH, 200))
        manager.updateAppWidget(ids, v)
    }
}
