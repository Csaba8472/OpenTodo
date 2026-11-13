import XCTest

/// Run after maestro/tablet/layout.yaml seeds and signs in to the installed native app.
/// Keyboard modifiers and UIKit drag sessions need XCTest's event APIs.
final class NativeInteractionTests: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "app.open-todo.ios")

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
        app.launch()
        XCTAssertTrue(app.staticTexts["Browse"].firstMatch.waitForExistence(timeout: 20))
        // The simulator connects XCTest's hardware keyboard on its first key event, which is
        // lost: a key no command uses goes first.
        app.typeKey(XCUIKeyboardKey.escape.rawValue, modifierFlags: [])
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testKeyboardCommands() {
        app.typeKey("f", modifierFlags: .command)
        let search = app.textFields["Search tasks and notes"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.typeText("trip")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Plan the trip soon")).firstMatch.waitForExistence(timeout: 5))
        // Leaving the field restores the native shortcut responder.
        search.typeText("\n")
        app.buttons["Today"].firstMatch.tap()
        app.typeKey("2", modifierFlags: .command)
        XCTAssertTrue(app.navigationBars["Inbox"].waitForExistence(timeout: 5))
        app.typeKey("n", modifierFlags: [])
        XCTAssertTrue(app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Add a task")).firstMatch.waitForExistence(timeout: 5))
        shot("ipad-keyboard-capture")
        app.buttons["Close"].tap()
    }

    func testSelectionAndCompletion() {
        app.typeKey("1", modifierFlags: .command)
        app.typeKey(XCUIKeyboardKey.downArrow.rawValue, modifierFlags: [])
        let title = app.textViews.matching(NSPredicate(format: "label BEGINSWITH %@", "Title")).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        let selected = title.value as? String ?? ""
        XCTAssertFalse(selected.isEmpty)
        app.typeKey(" ", modifierFlags: [])
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", selected)).firstMatch
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: row)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 5), .completed)
        shot("ipad-keyboard-complete")
    }

    func testDragTaskToSidebarProject() {
        app.typeKey("1", modifierFlags: .command)
        let task = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Plan the trip soon")).firstMatch
        let project = app.buttons["Travel"].firstMatch
        XCTAssertTrue(task.waitForExistence(timeout: 5))
        XCTAssertTrue(project.waitForExistence(timeout: 5))
        task.press(forDuration: 1.2, thenDragTo: project)
        project.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Plan the trip soon")).firstMatch.waitForExistence(timeout: 5))
        shot("ipad-drag-project")
    }

    /// Last by name: a compact window (Split View, Stage Manager) uses the iPhone layout, the
    /// tab bar without the sidebar and detail columns; the window is restored afterwards.
    func testWindowAtCompactWidth() {
        let window = app.windows.firstMatch
        let full = window.frame
        let corner = window.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1)).withOffset(CGVector(dx: -8, dy: -8))
        corner.press(forDuration: 0.2, thenDragTo: window.coordinate(withNormalizedOffset: CGVector(dx: 0.62, dy: 0.75)))
        XCTAssertLessThan(app.windows.firstMatch.frame.width, 500)
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Select a task to see its details here."].exists)
        shot("ipad-compact")
        let small = app.windows.firstMatch
        let grabber = small.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1)).withOffset(CGVector(dx: -8, dy: -8))
        let screen = XCUIApplication(bundleIdentifier: "com.apple.springboard").coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 1))
        grabber.press(forDuration: 0.2, thenDragTo: screen)
        XCTAssertEqual(app.windows.firstMatch.frame.width, full.width, accuracy: 40)
    }
}
