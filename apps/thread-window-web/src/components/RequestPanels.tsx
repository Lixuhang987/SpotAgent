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
    <div className="flex gap-2.5 overflow-x-auto border-t border-border bg-surface/30 px-3 py-2.5">
      {permissionRequests.map((request) => (
        <section
          key={request.id}
          className="flex-shrink-0 basis-[420px] max-w-[80vw] rounded-lg border border-border bg-surface px-2.5 py-2.5"
        >
          <strong className="block mb-2 text-sm text-text-primary">
            权限请求: {request.toolName}
          </strong>
          <pre className="max-h-[140px] mb-2.5 overflow-auto text-xs text-text-secondary whitespace-pre-wrap">
            {request.argumentsJSON}
          </pre>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onAnswerPermission(request.id, 'allow')}
              className="px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/20 text-sm text-accent transition-colors"
            >
              允许
            </button>
            <button
              type="button"
              onClick={() => onAnswerPermission(request.id, 'deny')}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface/80 text-sm text-text-primary transition-colors"
            >
              拒绝
            </button>
          </div>
        </section>
      ))}
      {workspaceRequests.map((request) => (
        <section
          key={request.id}
          className="flex-shrink-0 basis-[420px] max-w-[80vw] rounded-lg border border-border bg-surface px-2.5 py-2.5"
        >
          <strong className="block mb-2 text-sm text-text-primary">
            {request.prompt}
          </strong>
          <div className="flex gap-2 flex-wrap">
            {request.candidates.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                onClick={() => onAnswerWorkspace(request.id, candidate.id)}
                className="px-2.5 py-1.5 rounded-lg border border-accent/30 bg-accent/10 hover:bg-accent/20 text-sm text-accent transition-colors"
              >
                {candidate.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onAnswerWorkspace(request.id, null)}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface/80 text-sm text-text-primary transition-colors"
            >
              取消
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
