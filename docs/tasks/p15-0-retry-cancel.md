# P15.0 — AI Task Retry & Cancel

**类型**: bugfix  
**优先级**: P1  
**版本**: P15.0  
**依赖**: P11 Runtime  

---

## 修改文件

| 文件 | 修改 |
|------|------|
| `runtime-state-machine.js` | +dispatch_failed 状态 |
| `task-queue.js` | +dispatch_failed/cancelled |
| `runtime-core.js` | +retryTask, +cancelTask |
| `ai-task.js` | `/ai任务 重试`, `/ai任务 取消` |

## 功能

### /ai任务 重试 <taskId>

允许在以下状态重试:
- `dispatch_failed` → `dispatched`
- `artifact_received` (artifact missing) → re-dispatch
- `dispatched` → idempotent re-dispatch

### /ai任务 取消 <taskId>

允许在以下状态取消:
- `queued` / `planned` / `dispatched` / `artifact_received` / `review_pending` → `cancelled`

禁止取消:
- `approved` / `closed` / `rejected`

## 验收

| # | 标准 |
|---|------|
| 1 | `/ai任务 取消` 可取消未完成任务 |
| 2 | `/ai任务 重试` 可重试失败任务 |
| 3 | approved/closed 不可取消/重试 |
| 4 | Artifact 不删除 |
