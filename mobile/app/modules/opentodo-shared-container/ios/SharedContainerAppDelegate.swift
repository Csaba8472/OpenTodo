import ExpoModulesCore

/// At launch, before the app's JavaScript: the notification delegate and buttons, so a
/// button pressed while the app was closed reaches it, and the background refresh, which
/// iOS requires registered before launch ends.
public class SharedContainerAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    Reminders.shared.install()
    Refresh.shared.register()
    return true
  }
}
