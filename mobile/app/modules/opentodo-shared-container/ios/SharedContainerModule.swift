import BackgroundTasks
import CryptoKit
import ExpoModulesCore
import UserNotifications
#if canImport(WidgetKit)
import WidgetKit
#endif

/// The shared container on iOS (native-app-handover D1): the App Group the widget and the
/// share extension read and write (the web-view app's, `group.app.open-todo`), the
/// reminders as local notifications with Complete and Snooze, and the background refresh.
/// See the module's index.ts.
enum Container {
  static let appGroup = "group.app.open-todo"
  static let widgetFile = "widget.json"
  static let widgetKind = "TodayWidget"
  static let shareFile = "share.json"
  static let shareDirectory = "share"
  static let shareInboxDirectory = "share-inbox"
  static let uploadsDirectory = "shared-uploads"
  static let refreshTask = "app.opentodo.refresh"
  static let category = "reminder"
  static let snoozeSeconds: TimeInterval = 10 * 60
  /// iOS keeps 64 pending notifications; the reminders take at most 60 (D3).
  static let window = 60

  static var directory: URL {
    if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) { return url }
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }

  static func url(_ name: String) -> URL { directory.appendingPathComponent(name) }

  static func write(_ data: Data, _ name: String) {
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try? data.write(to: url(name), options: .atomic)
  }

  static let defaults = UserDefaults.standard
  static var generation: Int { defaults.integer(forKey: "opentodo.generation") }

  static let queueLock = NSRecursiveLock()

  /// A queue of JSON objects in the app's own defaults: the notification buttons pressed.
  static func append(_ key: String, _ item: [String: Any]) {
    queueLock.lock()
    defer { queueLock.unlock() }
    var list = (defaults.array(forKey: key) as? [[String: Any]]) ?? []
    if list.count >= 100 { list.removeFirst(list.count - 99) }
    list.append(item)
    defaults.set(list, forKey: key)
  }

  static func take(_ key: String) -> String {
    queueLock.lock()
    defer { queueLock.unlock() }
    let list = (defaults.array(forKey: key) as? [[String: Any]]) ?? []
    let data = (try? JSONSerialization.data(withJSONObject: list)) ?? Data("[]".utf8)
    return String(data: data, encoding: .utf8) ?? "[]"
  }
  static func ackAction(_ id: String, _ at: Double) {
    queueLock.lock()
    defer { queueLock.unlock() }
    let list = (defaults.array(forKey: "opentodo.actions") as? [[String: Any]]) ?? []
    defaults.set(list.filter { ($0["id"] as? String) != id || ($0["at"] as? Double) != at }, forKey: "opentodo.actions")
  }
}

public class SharedContainerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OpenTodoSharedContainer")
    View(TabletView.self) {
      Events("onCommand", "onTaskDrop")
      Prop("keyboardEnabled") { (view: TabletView, enabled: Bool) in view.keyboardEnabled = enabled }
      Prop("taskId") { (view: TabletView, id: String) in view.taskId = id }
      Prop("projectId") { (view: TabletView, id: String) in view.projectId = id }
    }
    Events("onShare", "onAction", "onRefresh")

    OnCreate {
      Reminders.shared.module = self
      Refresh.shared.module = self
    }

    Function("publishWidget") { (json: String) in
      guard json.utf8.count <= 512 * 1024, let data = json.data(using: .utf8),
            (try? JSONSerialization.jsonObject(with: data)) is [String: Any] else { return }
      Container.write(data, Container.widgetFile)
      #if canImport(WidgetKit)
      WidgetCenter.shared.reloadTimelines(ofKind: Container.widgetKind)
      #endif
    }

    AsyncFunction("scheduleReminders") { (json: String) -> String in
      await Reminders.shared.replace(json)
    }

    AsyncFunction("notify") { (json: String) -> Bool in
      await Reminders.shared.notify(json)
    }

    Function("takeActions") { Container.take("opentodo.actions") }

    Function("ackAction") { (id: String, at: Double) in Container.ackAction(id, at) }

    Function("takeShares") { () -> String in Shares.take() }

    Function("ackShare") { (id: String) in Shares.ack(id) }

    // The web-view app kept its server here (mobile/ios Prefs.swift), under the same bundle id.
    Function("shellServer") { Container.defaults.string(forKey: "server.origin") }

    Function("startRefresh") { Refresh.shared.schedule() }

    Function("pendingRefresh") { Refresh.shared.takePending() }

    Function("refreshDone") { Refresh.shared.finish() }

    AsyncFunction("writeFile") { (parts: [String]) -> String? in
      let dir = Container.url(Container.uploadsDirectory)
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let url = dir.appendingPathComponent(UUID().uuidString)
      FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      do {
        let out = try FileHandle(forWritingTo: url)
        defer { try? out.close() }
        var total = 0
        for part in parts {
          guard let bytes = Data(base64Encoded: part) else { throw CocoaError(.fileReadCorruptFile) }
          total += bytes.count
          guard total <= 26 * 1024 * 1024 else { throw CocoaError(.fileWriteOutOfSpace) }
          try out.write(contentsOf: bytes)
        }
        return url.path
      } catch {
        try? FileManager.default.removeItem(at: url)
        throw error
      }
    }

    Function("fileSha256") { (path: String) -> String? in
      guard let file = Shares.file(path), let data = try? Data(contentsOf: file) else { return nil }
      return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    Function("removeFile") { (path: String) in
      if let file = Shares.file(path) { try? FileManager.default.removeItem(at: file) }
    }

    Function("clear") {
      Container.defaults.set(Container.generation + 1, forKey: "opentodo.generation")
      UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
      UNUserNotificationCenter.current().removeAllDeliveredNotifications()
      Container.queueLock.lock()
      Container.defaults.removeObject(forKey: "opentodo.actions")
      Container.queueLock.unlock()
      Container.defaults.removeObject(forKey: Reminders.scheduledKey)
      try? FileManager.default.removeItem(at: Container.url(Container.widgetFile))
      Shares.clear()
      BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Container.refreshTask)
      #if canImport(WidgetKit)
      WidgetCenter.shared.reloadTimelines(ofKind: Container.widgetKind)
      #endif
    }
  }
}

/// The reminders as local notifications: the window of 60, Complete and Snooze (D3).
final class Reminders: NSObject, UNUserNotificationCenterDelegate {
  static let shared = Reminders()
  static let scheduledKey = "opentodo.scheduled"
  weak var module: SharedContainerModule?

  /// Installed at launch (SharedContainerAppDelegate), so a button pressed while the app
  /// was not running reaches it.
  func install() {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    let done = UNNotificationAction(identifier: "done", title: NSLocalizedString("Done", comment: "A reminder's button: complete the task"), options: [])
    let snooze = UNNotificationAction(identifier: "snooze", title: NSLocalizedString("Snooze 10 min", comment: "A reminder's button"), options: [])
    center.setNotificationCategories([UNNotificationCategory(identifier: Container.category, actions: [done, snooze], intentIdentifiers: [])])
  }

  private func authorized() async -> Bool {
    let center = UNUserNotificationCenter.current()
    let settings = await center.notificationSettings()
    switch settings.authorizationStatus {
    case .authorized, .provisional, .ephemeral: return true
    case .notDetermined: return (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    default: return false
    }
  }

  func replace(_ json: String) async -> String {
    let generation = Container.generation
    guard await authorized(), generation == Container.generation else { return "denied" }
    let center = UNUserNotificationCenter.current()
    let previous = (Container.defaults.stringArray(forKey: Self.scheduledKey)) ?? []
    center.removePendingNotificationRequests(withIdentifiers: previous)
    guard let data = json.data(using: .utf8), let list = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else { return "denied" }
    let now = Date().timeIntervalSince1970 * 1000
    var ids: [String] = []
    for r in list.prefix(Container.window) {
      guard let id = r["id"] as? String, let task = r["taskId"] as? String, let fireAt = r["fireAt"] as? Double, fireAt > now - 60_000 else { continue }
      add(id: id, task: task, title: r["title"] as? String, at: fireAt)
      ids.append(id)
    }
    Container.defaults.set(ids, forKey: Self.scheduledKey)
    return "granted"
  }

  private func add(id: String, task: String, title: String?, at fireAt: Double) {
    let content = UNMutableNotificationContent()
    content.title = title ?? NSLocalizedString("Reminder", comment: "A reminder without its task's title")
    content.body = NSLocalizedString("Task reminder", comment: "A reminder's text")
    content.sound = .default
    content.categoryIdentifier = Container.category
    content.userInfo = ["taskId": task]
    let seconds = max(1, fireAt / 1000 - Date().timeIntervalSince1970)
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
  }

  func notify(_ json: String) async -> Bool {
    let generation = Container.generation
    guard await authorized(), generation == Container.generation, let data = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
          let id = o["id"] as? String else { return false }
    let content = UNMutableNotificationContent()
    content.title = String((o["title"] as? String ?? "").prefix(200))
    content.body = String((o["body"] as? String ?? "").prefix(500))
    if let task = o["taskId"] as? String { content.userInfo = ["taskId": task] }
    try? await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "n-\(id)", content: content, trigger: nil))
    return true
  }

  // A reminder in front of the app shows as a banner, as on the home screen.
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
    [.banner, .sound, .list]
  }

  /// Complete and Snooze are queued for the app's JavaScript, which writes them as ops; a
  /// snooze fires again in ten minutes before that. A tap opens the task.
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let request = response.notification.request
    let id = request.identifier
    let scheduled = Container.defaults.stringArray(forKey: Self.scheduledKey) ?? []
    guard scheduled.contains(id) || response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
    switch response.actionIdentifier {
    case "done", "snooze":
      let now = Date().timeIntervalSince1970 * 1000
      if response.actionIdentifier == "snooze", let task = request.content.userInfo["taskId"] as? String {
        add(id: id, task: task, title: request.content.title, at: now + Container.snoozeSeconds * 1000)
      }
      Container.append("opentodo.actions", ["id": id, "action": response.actionIdentifier, "at": now])
      if let module { module.sendEvent("onAction", [:]) }
      else { NotificationCenter.default.post(name: Notification.Name("OpenTodoStartBackgroundRuntime"), object: nil) }
    case UNNotificationDefaultActionIdentifier:
      if let task = request.content.userInfo["taskId"] as? String,
         let encoded = task.addingPercentEncoding(withAllowedCharacters: .alphanumerics),
         let url = URL(string: "opentodo://task/\(encoded)") {
        await MainActor.run { UIApplication.shared.open(url) }
      }
    default: break
    }
  }
}

/// The background refresh (BGAppRefreshTask): the system wakes the app, its JavaScript runs
/// the refresh (src/background.ts) on `onRefresh` and says `refreshDone`.
final class Refresh {
  static let shared = Refresh()
  weak var module: SharedContainerModule?
  private var task: BGAppRefreshTask?
  private var pending = false

  func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: Container.refreshTask, using: nil) { task in
      guard let task = task as? BGAppRefreshTask else { return task.setTaskCompleted(success: false) }
      self.run(task)
    }
  }

  /// At most hourly; the system decides when.
  func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: Container.refreshTask)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }

  private func run(_ task: BGAppRefreshTask) {
    schedule()
    self.task = task
    task.expirationHandler = { [weak self] in self?.finish(success: false) }
    if let module {
      module.sendEvent("onRefresh", [:])
    } else {
      // Launched for the refresh: the JavaScript asks when it starts (pendingRefresh).
      pending = true
      NotificationCenter.default.post(name: Notification.Name("OpenTodoStartBackgroundRuntime"), object: nil)
    }
    // Whatever the JavaScript does, the task ends within the system's time.
    DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.finish(success: true) }
  }

  func takePending() -> Bool {
    defer { pending = false }
    return pending
  }

  func finish(success: Bool = true) {
    task?.setTaskCompleted(success: success)
    task = nil
    pending = false
  }
}

/// Atomic per-share manifests plus the shell's legacy single manifest. Acknowledgement
/// removes only the manifest; pending uploads own their source files until successful PUT.
enum Shares {
  static func file(_ path: String) -> URL? {
    let url = URL(fileURLWithPath: path).standardizedFileURL
    let parent = url.deletingLastPathComponent()
    let allowed = [Container.shareDirectory, Container.uploadsDirectory].contains { parent == Container.url($0).standardizedFileURL }
    return allowed && FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  static func manifests() -> [URL] {
    let dir = Container.url(Container.shareInboxDirectory)
    let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
    return [Container.url(Container.shareFile)] + files.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  static func take() -> String {
    var shares: [[String: Any]] = []
    for manifest in manifests() {
      guard let data = try? Data(contentsOf: manifest),
            var entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
      if entry["id"] == nil {
        entry["id"] = UUID().uuidString.lowercased()
        guard let updated = try? JSONSerialization.data(withJSONObject: entry),
              (try? updated.write(to: manifest, options: .atomic)) != nil else { continue }
      }
      var files: [[String: Any]] = []
      for f in (entry["files"] as? [[String: Any]]) ?? [] {
        guard let path = f["path"] as? String else { continue }
        let url = Container.url(path).standardizedFileURL
        guard url.deletingLastPathComponent() == Container.url(Container.shareDirectory).standardizedFileURL else { continue }
        // Keep a missing file in the entry: JS must retry/report it, not silently ack it.
        let size = ((try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber)?.int64Value ?? -1
        files.append(["path": url.path, "name": f["name"] as? String ?? "file", "type": f["type"] as? String ?? "application/octet-stream", "size": size])
      }
      shares.append([
        "id": entry["id"] as? String ?? "",
        "title": entry["title"] as? String ?? "", "text": entry["text"] as? String ?? "", "url": entry["url"] as? String ?? "",
        "files": files, "at": Date().timeIntervalSince1970 * 1000,
      ])
    }
    let out = (try? JSONSerialization.data(withJSONObject: shares)) ?? Data("[]".utf8)
    return String(data: out, encoding: .utf8) ?? "[]"
  }

  static func ack(_ id: String) {
    for manifest in manifests() {
      guard let data = try? Data(contentsOf: manifest),
            let entry = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], entry["id"] as? String == id else { continue }
      try? FileManager.default.removeItem(at: manifest)
    }
  }

  static func clear() {
    for name in [Container.shareFile, Container.shareDirectory, Container.shareInboxDirectory, Container.uploadsDirectory] {
      try? FileManager.default.removeItem(at: Container.url(name))
    }
  }
}
