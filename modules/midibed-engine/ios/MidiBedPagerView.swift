import ExpoModulesCore
import UIKit

/// A plain container (it is not an accessibility element itself, so everything
/// inside stays individually reachable) that catches two VoiceOver actions for the
/// whole screen, however the user triggers them (gesture or braille keyboard):
///
/// 1. Page scroll: the three-finger swipe left/right that moves between pages on
///    the Home screen. UIKit offers the action to the focused element and then up
///    through its superviews until one returns true; the scroll view inside handles
///    up/down and cannot scroll sideways, so left/right arrive here.
/// 2. Magic tap: the two-finger double tap. Reported to JS, which starts or stops
///    playback. This lives here, in a real native view, because a magic-tap handler
///    on an ordinary React Native wrapper View never reached the device: React
///    Native removes ("flattens") plain wrapper views, leaving nothing to receive it.
///
/// Direction convention for the swipe (as for paged scrolling elsewhere on iOS):
/// swiping LEFT reveals the next page, RIGHT the previous one. The swipes work on
/// Rusty's phone (2026-10-08); if the direction ever feels reversed, swap the cases.
class MidiBedPagerView: ExpoView {
  let onPage = EventDispatcher()
  let onMagicTap = EventDispatcher()

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

  override func accessibilityPerformMagicTap() -> Bool {
    onMagicTap([:])
    return true
  }
}
