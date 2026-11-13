package app.opentodo.container

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Background work (native-app-handover D3, background refresh): WorkManager runs one of the
 * app's headless JavaScript tasks (index.ts, src/background.ts) in the app's React host,
 * started without a screen when the app is not running. Hourly with a network, the refresh
 * (pull, widget, reminders, notifications); once after a notification button, the action.
 */
class JsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val task = inputData.getString("task") ?: return Result.success()
        val app = applicationContext as? ReactApplication ?: return Result.success()
        val finished = CompletableDeferred<Unit>()
        val taskId = AtomicInteger(-1)
        withContext(Dispatchers.Main) {
            val host = app.reactHost ?: run { finished.complete(Unit); return@withContext }
            val start = { context: ReactContext ->
                val jobs = HeadlessJsTaskContext.getInstance(context)
                jobs.addTaskEventListener(object : HeadlessJsTaskEventListener {
                    override fun onHeadlessJsTaskStart(id: Int) {}
                    override fun onHeadlessJsTaskFinish(id: Int) {
                        if (id == taskId.get()) { jobs.removeTaskEventListener(this); finished.complete(Unit) }
                    }
                })
                taskId.set(jobs.startTask(HeadlessJsTaskConfig(task, Arguments.createMap(), LIMIT_MS, true)))
            }
            val current = host.currentReactContext
            if (current != null) start(current)
            else {
                host.addReactInstanceEventListener(object : ReactInstanceEventListener {
                    override fun onReactContextInitialized(context: ReactContext) {
                        host.removeReactInstanceEventListener(this)
                        start(context)
                    }
                })
                host.start()
            }
        }
        withTimeoutOrNull(LIMIT_MS + 5_000) { finished.await() }
        return Result.success()
    }

    companion object { const val LIMIT_MS = 30_000L }
}

object Background {
    const val REFRESH_TASK = "OpenTodoRefresh"
    const val ACTION_TASK = "OpenTodoAction"
    private const val PERIODIC = "refresh"

    /** Runs [task] once now (a notification button); a second press while one waits joins it. */
    fun run(context: Context, task: String) {
        val req = OneTimeWorkRequestBuilder<JsWorker>().setInputData(workDataOf("task" to task)).build()
        WorkManager.getInstance(context).enqueueUniqueWork(task, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }

    /** The hourly refresh while signed in; the system may run it later (Doze, battery saver). */
    fun schedule(context: Context) {
        val req = PeriodicWorkRequestBuilder<JsWorker>(1, TimeUnit.HOURS)
            .setInputData(workDataOf("task" to REFRESH_TASK))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).apply {
            cancelUniqueWork(PERIODIC)
            cancelUniqueWork(REFRESH_TASK)
            cancelUniqueWork(ACTION_TASK)
        }
    }
}
