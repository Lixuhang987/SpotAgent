import ApplicationServices
import Carbon.HIToolbox
import Foundation

final class HotkeyService {
    var onTrigger: (@MainActor @Sendable () -> Void)?

    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?

    private let targetKeyCode: UInt32 = UInt32(kVK_Space)
    private let targetModifiers: UInt32 = UInt32(cmdKey | shiftKey)
    private let hotKeyID = EventHotKeyID(signature: OSType(0x48414754), id: 1)

    func start() -> Bool {
        stop()

        let eventType = EventTypeSpec(
            eventClass: UInt32(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let userData else { return noErr }

                let service = Unmanaged<HotkeyService>.fromOpaque(userData).takeUnretainedValue()
                guard let event else { return noErr }

                var pressedHotKeyID = EventHotKeyID()
                let parameterStatus = GetEventParameter(
                    event,
                    EventParamName(kEventParamDirectObject),
                    EventParamType(typeEventHotKeyID),
                    nil,
                    MemoryLayout<EventHotKeyID>.size,
                    nil,
                    &pressedHotKeyID
                )

                guard parameterStatus == noErr, pressedHotKeyID.id == service.hotKeyID.id else {
                    return noErr
                }

                let onTrigger = service.onTrigger
                Task { @MainActor in
                    onTrigger?()
                }

                return noErr
            },
            1,
            [eventType],
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandlerRef
        )

        guard installStatus == noErr else {
            return false
        }

        let registerStatus = RegisterEventHotKey(
            targetKeyCode,
            targetModifiers,
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )

        if registerStatus != noErr {
            stop()
            return false
        }

        return true
    }

    func stop() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }

        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }
}
