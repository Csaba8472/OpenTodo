// Generated AppDelegate integration for restored SwiftUI sessions and cold background
// refreshes. Kept as a pure transform so prebuild and local incremental builds agree.
/** @param {string} source */
function sceneHandover(source) {
  const marker = '// OpenTodo: restore the native scene and background runtime'
  if (source.includes(marker)) return keyboardCommands(source)
  const anchor = '    return super.application(application, didFinishLaunchingWithOptions: launchOptions)'
  const boundary = '\n}\n\nclass ReactNativeDelegate'
  if (!source.includes(anchor) || !source.includes(boundary)) throw new Error('Recheck the Expo scene handover for this template')
  source = source.replace(anchor, `    ${marker}
    NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self, self.window == nil,
            let scene = application.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
            !(scene.delegate is SceneDelegate) else { return }
      // iOS restores SwiftUI.AppSceneDelegate across the update, bypassing the new
      // configuration callback. Reuse the session and attach the native window.
      let sceneDelegate = SceneDelegate()
      let window = UIWindow(windowScene: scene)
      sceneDelegate.window = window
      scene.delegate = sceneDelegate
      self.window = window
      factory.startReactNative(withModuleName: self.reactNativeFactoryModuleName, in: window, launchOptions: launchOptions)
    }
    NotificationCenter.default.addObserver(forName: Notification.Name("OpenTodoStartBackgroundRuntime"), object: nil, queue: .main) { [weak self] _ in
      guard let self, self.window == nil, !self.backgroundRuntimeStarted else { return }
      self.backgroundRuntimeStarted = true
      // BGAppRefresh can launch without connecting a scene. Start JS so index.ts
      // can take pendingRefresh; no window or screen is presented.
      factory.startReactNative(withModuleName: self.reactNativeFactoryModuleName, in: nil, launchOptions: nil)
    }
${anchor}`)
  return keyboardCommands(source.replace(boundary, `
  private var backgroundRuntimeStarted = false

  public func application(
    _ application: UIApplication,
    configurationForConnecting session: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: "Default Configuration", sessionRole: session.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}\n\nclass ReactNativeDelegate`))
}

function keyboardCommands(source) {
  if (source.includes('// OpenTodo: hardware keyboard commands')) return source
  return source.replace('\n}\n\nclass ReactNativeDelegate', `
  // OpenTodo: hardware keyboard commands. The application delegate stays in the
  // responder chain across the split view's independent navigation controllers.
  public override var keyCommands: [UIKeyCommand]? {
    guard UIDevice.current.userInterfaceIdiom == .pad,
          let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
          scene.coordinateSpace.bounds.width >= 768 else { return nil }
    func editing(_ view: UIView) -> Bool {
      if view.isFirstResponder && view is UITextInput { return true }
      return view.subviews.contains(where: editing)
    }
    var commands = [UIKeyCommand(input: "f", modifierFlags: .command, action: #selector(openTodoKeyCommand(_:)))]
    commands += (1...5).map { UIKeyCommand(input: String($0), modifierFlags: .command, action: #selector(openTodoKeyCommand(_:))) }
    if !scene.windows.contains(where: editing) {
      commands += ["n", " ", UIKeyCommand.inputUpArrow, UIKeyCommand.inputDownArrow].map {
        UIKeyCommand(input: $0, modifierFlags: [], action: #selector(openTodoKeyCommand(_:)))
      }
    }
    commands.forEach { $0.wantsPriorityOverSystemBehavior = true }
    return commands
  }

  @objc private func openTodoKeyCommand(_ key: UIKeyCommand) {
    guard let input = key.input else { return }
    let name = key.modifierFlags.contains(.command) ? "cmd-\\(input)" : input
    NotificationCenter.default.post(name: Notification.Name("OpenTodoKeyboardCommand"), object: nil, userInfo: ["command": name])
  }
}\n\nclass ReactNativeDelegate`)
}

module.exports = { sceneHandover }
