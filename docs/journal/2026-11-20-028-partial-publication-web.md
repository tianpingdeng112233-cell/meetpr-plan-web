# 028 · 按已排好的课发布（网页卡）

2026-11-20，T2 / P1。Codex 实装到一半额度用完，Claude 明示降级接手收尾。基点 `1088cce`（origin/main）。配套后端 spec 070 / 迁移 0090。

## 改动

- 去掉「训练日还没有动作」的发布/更新拦截和待核对计数；空训练日留在原 D 编号，之后可直接补课再更新。
- 改为「至少有一节排好动作的课」才能发布或更新，否则提示 `noScheduledSessions`。未绑定、缺组等原有校验不变。
- 发布与批量保存带 `allow_empty_training_days=true`。
- 上线顺序保护：已发布计划里有空训练日时，先读 `partial_plan_publication_enabled`；旧后端没有这个标记就在写入前拒绝（`PARTIAL_PUBLICATION_UNAVAILABLE`），避免学员收到空课。
- 学员游标排除占位日。繁体文案用 `npm run gen:zh-hant` 重新生成。

## 证据

- 全量 `vitest run` 1652 绿，`tsc --noEmit` 干净。
- 与后端同批的真 PostgreSQL + Chrome 端到端：首发 → 刷新后 W3D1 仍是「D1」→ 粘贴处方 → 更新计划，学员从 4 节变 5 节。截图在 Codex scratch `~/Documents/Codex/2026-11-20/jiao/outputs/`。

## 待办

- 后端部署 staging 后再换装网页。
