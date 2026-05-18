# blob

大段上下文内容的本地持久化层。Blob 存完整二进制或文本，LLM 上下文只持有 runtime 渲染出的 stub 引用。

## 文件

| 文件 | 职责 |
|------|------|
| `BlobRecord.ts` | `BlobRecord` 元数据：`id / kind / size / path / summary` |
| `BlobStore.ts` | `BlobStore` 接口：`put / get / readContent / setSummary` |
| `FilesystemBlobStore.ts` | 默认磁盘实现，写入 `~/.spotAgent/blobs/<yyyy-mm-dd>/<uuid>.<ext>` 与 sidecar metadata |

## 约束

- blob 文件不自动清理，后续如需 GC 另行设计。
- `summary` 只写入 sidecar；原始 blob 文件保持不变。
- core 只依赖 Node 标准库，不引入 UI 或 macOS API。
