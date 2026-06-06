import type { PermissionRequestState, WorkspaceRequestState } from "../store/threadWindowStore.ts";

export function RequestPanels({
  permissionRequests,
  workspaceRequests,
  onAnswerPermission,
  onAnswerWorkspace,
}: {
  permissionRequests: PermissionRequestState[];
  workspaceRequests: WorkspaceRequestState[];
  onAnswerPermission(requestId: string, decision: "allow" | "deny"): void;
  onAnswerWorkspace(requestId: string, workspaceId: string | null): void;
}) {
  if (permissionRequests.length === 0 && workspaceRequests.length === 0) {
    return null;
  }

  return (
    <div className="request-panels">
      {permissionRequests.map((request) => (
        <section className="request-panel" key={request.id}>
          <strong>{request.toolName}</strong>
          <pre>{request.argumentsJSON}</pre>
          <div className="request-actions">
            <button type="button" onClick={() => onAnswerPermission(request.id, "allow")}>允许</button>
            <button type="button" onClick={() => onAnswerPermission(request.id, "deny")}>拒绝</button>
          </div>
        </section>
      ))}
      {workspaceRequests.map((request) => (
        <section className="request-panel" key={request.id}>
          <strong>{request.prompt}</strong>
          <div className="request-actions">
            {request.candidates.map((candidate) => (
              <button type="button" key={candidate.id} onClick={() => onAnswerWorkspace(request.id, candidate.id)}>
                {candidate.name}
              </button>
            ))}
            <button type="button" onClick={() => onAnswerWorkspace(request.id, null)}>取消</button>
          </div>
        </section>
      ))}
    </div>
  );
}
