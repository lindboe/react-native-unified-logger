import RNUnifiedLogger
import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Demo: log from Swift before React Native has started. These entries are
    // buffered natively and delivered to the JS callback once JS configures
    // the logger (if a callback / `js` destination is in effect), and written
    // to os_log immediately under category "LoggerDemo".
    UnifiedLogger.debug(tag: "LoggerDemo", message: "didFinishLaunching (Swift, before RN start)")
    UnifiedLogger.info(tag: "LoggerDemo", message: "Swift info at startup")
    UnifiedLogger.warn(tag: "LoggerDemo", message: "Swift warn at startup")
    UnifiedLogger.log(.error, tag: "LoggerDemo", message: "Swift error at startup")

    // Demo: log from Swift every time the app returns to the foreground.
    NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { _ in
      UnifiedLogger.info(tag: "Lifecycle", message: "didBecomeActive (Swift)")
    }
    NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
    ) { _ in
      UnifiedLogger.warn(tag: "Lifecycle", message: "didEnterBackground (Swift); pending work may be suspended")
    }
    return true
  }
}
