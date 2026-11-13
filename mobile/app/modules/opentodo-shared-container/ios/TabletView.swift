import ExpoModulesCore
import UniformTypeIdentifiers
import UIKit

/// A responder in the content's chain: shortcuts never take N, Space or arrows from a
/// text field. Drag payloads stay inside this app and are only task ids, never content.
final class TabletView: ExpoView, UIDragInteractionDelegate, UIDropInteractionDelegate {
  let onCommand = EventDispatcher()
  let onTaskDrop = EventDispatcher()
  var taskId = ""
  var projectId = ""
  var keyboardEnabled = false { didSet { claimKeyboard() } }
  private var focusObservers: [NSObjectProtocol] = []
  private var commandObserver: NSObjectProtocol?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDragInteraction(delegate: self))
    addInteraction(UIDropInteraction(delegate: self))
    addInteraction(UIPointerInteraction(delegate: nil))
    for name in [UITextField.textDidEndEditingNotification, UITextView.textDidEndEditingNotification, UIApplication.didBecomeActiveNotification] {
      focusObservers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        DispatchQueue.main.async { [weak self] in self?.claimKeyboard() }
      })
    }
    commandObserver = NotificationCenter.default.addObserver(forName: Notification.Name("OpenTodoKeyboardCommand"), object: nil, queue: .main) { [weak self] notification in
      guard let self, self.keyboardEnabled, self.window != nil,
            let command = notification.userInfo?["command"] as? String else { return }
      self.onCommand(["command": command])
    }
  }

  deinit {
    if let commandObserver { NotificationCenter.default.removeObserver(commandObserver) }
    focusObservers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  override var canBecomeFirstResponder: Bool { keyboardEnabled }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    DispatchQueue.main.async { [weak self] in self?.claimKeyboard() }
  }

  private func claimKeyboard() {
    guard keyboardEnabled, let window else { return }
    func editing(_ view: UIView) -> Bool {
      if view.isFirstResponder && view is UITextInput { return true }
      return view.subviews.contains(where: editing)
    }
    if !editing(window) { becomeFirstResponder() }
  }

  func dragInteraction(_ interaction: UIDragInteraction, itemsForBeginning session: UIDragSession) -> [UIDragItem] {
    guard !taskId.isEmpty else { return [] }
    let item = UIDragItem(itemProvider: NSItemProvider(object: taskId as NSString))
    item.localObject = taskId
    return [item]
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    !projectId.isEmpty && session.localDragSession != nil && session.items.contains { $0.localObject is String }
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession) -> UIDropProposal {
    UIDropProposal(operation: dropInteraction(interaction, canHandle: session) ? .move : .forbidden)
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    guard dropInteraction(interaction, canHandle: session) else { return }
    for item in session.items {
      if let id = item.localObject as? String { onTaskDrop(["taskId": id]) }
    }
  }
}
