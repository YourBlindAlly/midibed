import ExpoModulesCore
import UIKit

/// A plain container (it is not an accessibility element itself, so everything
/// inside stays individually reachable) that catches VoiceOver's page-scroll
/// action: the three-finger swipe left/right that moves between pages on the
/// Home screen, and the braille-keyboard commands VoiceOver maps to the same
/// action. UIKit offers the action to the focused element and then up through
/// its superviews until one returns true; the scroll view inside handles
/// up/down, and cannot scroll sideways, so left/right arrive here.
///
/// Direction convention (as for paged scrolling elsewhere on iOS): swiping LEFT
/// reveals the next page, RIGHT the previous one. If it turns out reversed on a
/// real device, swap the two cases below, nothing else.
class MidiBedPagerView: ExpoView {
  let onPage = EventDispatcher()

  override func accessibilityScroll(_ direction: UIAccessibilityScrollDirection) -> Bool {
    switch direction {
    case .left:
      onPage(["direction": "next"])
      return true
    case .right:
      onPage(["direction": "previous"])
      return true
    default:
      return false
    }
  }
}
