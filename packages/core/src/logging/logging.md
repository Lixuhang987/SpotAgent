# logging

把 LLM provider 的网络 JSON 落盘，方便事后排查。是 `VercelClient` 的可选注入项，不参与产品决策。

## 文件

| 文件 | 职责 |
|------|------|
| `NetworkLogger.ts` | `NetworkLogger.log(entry)` 接口 + `NetworkLogEntry`（`timestamp / direction / url / method / status / body`） |
| `createLoggingFetch.ts` | `fetch` 装饰器：发请求前后各 log 一次；响应通过 `clone().text()` 读 body 不消耗原响应；记录失败默默忽略（不阻塞主流程）；请求 JSON 中的 image payload / data URI 会脱敏 |
| `FileNetworkLogger.ts` | JSONL 实现：按本地日期分桶，单文件超 1 MiB（`maxFileBytes` 可配）切下一个序号；写入串行化以避免错位 |
| `index.ts` | 桶导出 |

## 落盘路径

```
~/.spotAgent/log/<YYYY-MM-DD>/network-001.jsonl
                              network-002.jsonl
                              ...
```

每行一个 `NetworkLogEntry` JSON。读起来直接：

```bash
jq . ~/.spotAgent/log/2026-05-17/network-001.jsonl
```

## 注入点

```
agent-server / SettingsBackedLLMClient
  └─ new VercelClient({ networkLogger: new FileNetworkLogger({ baseDir: ~/.spotAgent/log }) })
       └─ createLoggingFetch({ logger, baseFetch })
            └─ provider.<chat|completion|responses>(model)
                 └─ streamText(...)  ← 内部走包装后的 fetch
```

## 当前限制

- 写错误被吞：`writeChain` 用 `.catch(() => {})` 静默掉错误。
- `tryParseBody` 对 typed array 返回占位字符串，不存原始字节；如需排查二进制 body 需要换实现。
- 日期分桶用本地时区，UTC 临界点会跨桶（desktop 单机使用基本无感）。

## 编辑此目录的约束

- 不要把 `NetworkLogger` 当成产品级日志；产品事件审计用 `SessionEvent` 走 `SessionStore.appendEvents`。
- logger 内只允许做必要脱敏，不做产品级过滤或决策；当前会脱敏多模态图片 payload。
- 新增 logger 实现必须保持 `log()` 不抛——外层 fetch 装饰器假定 logger 不会让请求失败。

## 相关文档

- 调用方：[llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
- agent-server 接线：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
