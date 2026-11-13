package app.opentodo.container

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The app's side of the shared container (native-app-handover D1); see the module's index.ts. */
class SharedContainerModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("OpenTodoSharedContainer")
        Events("onShare")

        Function("publishWidget") { json: String -> WidgetStore.publish(context, json) }

        Function("scheduleReminders") { json: String ->
            Scheduler.replace(context, json)
            when {
                !Scheduler.notificationsAllowed(context) -> "denied"
                !Scheduler.canExact(context) -> "exact-denied"
                else -> "granted"
            }
        }

        Function("notify") { json: String -> Notifier.inApp(context, json) }

        Function("takeActions") { Store(context).takeActions() }

        Function("takeShares") {
            Shares.capture(context, appContext.currentActivity?.intent)
            Store(context).takeShares()
        }

        Function("shellServer") { Store.shellServer(context) }

        Function("startRefresh") { Background.schedule(context) }

        // Shared files live under the app's files/shares; nothing else is read or removed.
        Function("fileSha256") { path: String -> Shares.file(context, path)?.let { Shares.sha256(it) } }

        Function("removeFile") { path: String -> Shares.file(context, path)?.delete(); Unit }

        Function("clear") {
            Scheduler.clear(context)
            Background.cancel(context)
            Store(context).clear()
            WidgetStore.redraw(context)
        }

        OnNewIntent { intent ->
            if (Shares.capture(context, intent)) sendEvent("onShare", emptyMap<String, Any>())
        }
    }
}
