import Foundation

struct BuiltinToolSetting: Identifiable, Equatable {
    enum Risk: String, Equatable {
        case low
        case medium
        case high

        var label: String {
            switch self {
            case .low: return "低风险"
            case .medium: return "中风险"
            case .high: return "高风险"
            }
        }
    }

    let id: String
    let name: String
    let title: String
    let description: String
    let risk: Risk
    var isEnabled: Bool

    var riskLabel: String { risk.label }
}

@Observable
@MainActor
final class ToolSettingsViewModel {
    @ObservationIgnored private let store: AgentSettingsStore

    private static let catalog: [BuiltinToolSetting] = [
        BuiltinToolSetting(
            id: "clipboard.read",
            name: "clipboard.read",
            title: "剪贴板读取",
            description: "读取当前剪贴板中的文本或富文本内容。",
            risk: .high,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "app.frontmost",
            name: "app.frontmost",
            title: "前台 App",
            description: "读取当前前台应用的名称与标识符。",
            risk: .low,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "window.list",
            name: "window.list",
            title: "窗口列表",
            description: "列出当前桌面上可见的窗口信息。",
            risk: .medium,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "screen.capture",
            name: "screen.capture",
            title: "屏幕截图",
            description: "按需截取屏幕、窗口或区域图像。",
            risk: .high,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "ocr.read",
            name: "ocr.read",
            title: "OCR 识别",
            description: "识别图片中的文字内容。",
            risk: .medium,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "accessibility.snapshot",
            name: "accessibility.snapshot",
            title: "可访问性快照",
            description: "读取前台应用的可访问性树结构。",
            risk: .high,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "accessibility.action",
            name: "accessibility.action",
            title: "可访问性操作",
            description: "执行点击、按压或设置值等界面操作。",
            risk: .high,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "workspace.list",
            name: "workspace.list",
            title: "Workspace 列表",
            description: "列出当前已配置的 workspace。",
            risk: .low,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "file.read",
            name: "file.read",
            title: "文件读取",
            description: "读取 workspace 范围内的文件内容。",
            risk: .high,
            isEnabled: true
        ),
        BuiltinToolSetting(
            id: "file.write",
            name: "file.write",
            title: "文件写入",
            description: "写入或修改 workspace 范围内的文件。",
            risk: .high,
            isEnabled: true
        )
    ]

    init(store: AgentSettingsStore) {
        self.store = store
    }

    var tools: [BuiltinToolSetting] {
        Self.catalog.map { tool in
            var next = tool
            next.isEnabled = isEnabled(tool.name)
            return next
        }
    }

    func isEnabled(_ toolName: String) -> Bool {
        if store.toolSettings.denylist.contains(toolName) {
            return false
        }
        if let allowlist = store.toolSettings.allowlist {
            return allowlist.contains(toolName)
        }
        return true
    }

    func setEnabled(_ toolName: String, enabled: Bool) {
        store.updateToolSettings { settings in
            var denylist = Set(settings.denylist)
            var allowlist = settings.allowlist

            if enabled {
                denylist.remove(toolName)
                if var allowlist {
                    if !allowlist.contains(toolName) {
                        allowlist.append(toolName)
                        allowlist.sort()
                    }
                    settings.allowlist = allowlist
                }
            } else {
                denylist.insert(toolName)
            }

            settings.denylist = Array(denylist).sorted()
        }
    }
}
