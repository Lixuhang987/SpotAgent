import type { PermissionRequestState, WorkspaceRequestState } from '../store/threadWindowStore.ts';

interface RequestPanelsProps {
  permissionRequests: PermissionRequestState[];
  workspaceRequests: WorkspaceRequestState[];
  onAnswerPermission: (requestId: string, decision: 'allow' | 'deny') => void;
  onAnswerWorkspace: (requestId: string, workspaceId: string | null) => void;
}

export function RequestPanels({
  permissionRequests,
  workspaceRequests,
  onAnswerPermission,
  onAnswerWorkspace,
}: RequestPanelsProps) {
  if (permissionRequests.length === 0 && workspaceRequests.length === 0) {
    return null;
  }

  return (
    <div className="grid min-w-0 gap-sm overflow-hidden border-t border-app-hairline bg-app-canvas/85 px-sm py-sm md:grid-cols-2">
      {permissionRequests.map((request) => (
        <section
          key={request.id}
          className="min-w-0 rounded-xl border border-app-hairline bg-app-surface-elevated/95 px-sm py-sm shadow-[var(--thread-window-floating-shadow)]"
        >
          <strong className="mb-xs block text-sm font-medium text-app-text-primary">
            权限请求: {request.toolName}
          </strong>
          <pre className="mb-sm max-h-[140px] overflow-auto rounded-lg bg-app-surface p-sm font-code text-xs text-app-text-muted whitespace-pre-wrap">
            {request.argumentsJSON}
          </pre>
          <div className="flex flex-wrap gap-xs">
            <button
              type="button"
              onClick={() => onAnswerPermission(request.id, 'allow')}
              className="h-9 rounded-md bg-app-accent px-sm text-sm font-medium text-app-on-accent transition-colors duration-200 hover:bg-app-accent-hover focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
            >
              允许
            </button>
            <button
              type="button"
              onClick={() => onAnswerPermission(request.id, 'deny')}
              className="h-9 rounded-md border border-app-hairline bg-app-surface px-sm text-sm font-medium text-app-text-primary transition-colors duration-200 hover:bg-app-canvas focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
            >
              拒绝
            </button>
          </div>
        </section>
      ))}
      {workspaceRequests.map((request) => (
        <section
          key={request.id}
          className="min-w-0 rounded-xl border border-app-hairline bg-app-surface-elevated/95 px-sm py-sm shadow-[var(--thread-window-floating-shadow)]"
        >
          <strong className="mb-sm block text-sm font-medium text-app-text-primary">
            {request.prompt}
          </strong>
          <div className="flex flex-wrap gap-xs">
            {request.candidates.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                onClick={() => onAnswerWorkspace(request.id, candidate.id)}
                className="h-9 rounded-md bg-app-accent px-sm text-sm font-medium text-app-on-accent transition-colors duration-200 hover:bg-app-accent-hover focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
              >
                {candidate.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onAnswerWorkspace(request.id, null)}
              className="h-9 rounded-md border border-app-hairline bg-app-surface px-sm text-sm font-medium text-app-text-primary transition-colors duration-200 hover:bg-app-canvas focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
            >
              取消
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
