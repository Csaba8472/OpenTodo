import XCTest

/// Share a page from Safari to OpenTodo (native-app-handover 1.4, maestro/ios-device.sh). The
/// share sheet is drawn by another process, whose elements Maestro reports in that view's own
/// coordinates, so its taps land elsewhere; XCTest resolves them on the screen. Run only with
/// TEST_RUNNER_OPENTODO_SHARE_PAGE=1 while Safari shows the page.
final class SafariShareTests: XCTestCase {
    func testShareFromSafari() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["OPENTODO_SHARE_PAGE"] != nil, "run by maestro/ios-device.sh")
        continueAfterFailure = false
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        XCTAssertTrue(safari.staticTexts["An article worth reading"].firstMatch.waitForExistence(timeout: 15))
        safari.buttons["More"].firstMatch.tap()
        let share = safari.buttons["Share"].firstMatch
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        share.tap()
        let cell = safari.descendants(matching: .any).matching(identifier: "shareCell").matching(NSPredicate(format: "label == %@", "OpenTodo")).firstMatch
        if !cell.waitForExistence(timeout: 10) {
            // Not among the suggested apps yet: the sheet's More lists every extension.
            safari.descendants(matching: .any).matching(identifier: "shareCell").matching(NSPredicate(format: "label == %@", "More")).firstMatch.tap()
        }
        XCTAssertTrue(cell.waitForExistence(timeout: 10))
        cell.tap()
        // The extension saves the share and closes the sheet.
        XCTAssertTrue(cell.waitForNonExistence(timeout: 15))
    }
}
