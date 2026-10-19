# 012 · 实装卡 — 插入 / 删除训练日，列头只写星期

先读仓根 `CONTEXT.md`、`CLAUDE.md`，再完整读 `specs/012-insert-delete-training-day/SPEC.md`，以及前置 `specs/011-block-editor/SPEC.md` 的 §1、§4、§5（了解现有 block 网格、积木手势与落列规则）。SPEC 012 是唯一验收口径。分支 `feat/012-insert-delete-day`（基于 main a41af9a）。

## 目标
1. 列头只写星期；每张日卡左上角「Dx · 日期」，Dx 按这一周的日期顺序编号（与手机端 `dayCode` 一致），编辑卡头部同步。
2. 在同一周两张卡之间 / 首尾插入一天（只改这一周），星期对不上已有列时新开一列、其他周空白。
3. 删除整天（Delete / 右键「删除这天」，确认 + 可撤销，有打卡不能删），列在所有周空了且不在星期规律里时自动收掉。

## 文件范围（预计）
`src/features/plan-editor/blockGridModel.ts`、`components/BlockGrid.tsx`、`components/block-grid.css`、`PlanEditor.tsx`（手势与右键菜单接线）、`components/DayColumn.tsx`（编辑卡头部 Dx）、`src/i18n/*`，以及对应测试。

## 约束
- 不改数据模型、后端、`reconcile` 本身；不回退 spec 011（含卡 A–D）任何已交付行为。
- 不用橙 / 金色（淡黄高亮可用）；中英文文案都要。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam
按 SPEC 012「测试 seam」三条，先写会红的用例、实际跑出红，再实装转绿。spec 011 的 `block-grid-ui`、`blockGridModel`、`block-date-save`、`block-history-ui` 等现有测试必须全绿（Dx 显示位置变化导致的断言可迁移，但不得删除业务断言）。

## 验收
SPEC 012 验收清单 1–8。浏览器验收由 Claude 在沙箱外做。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加一段：改动文件、红→绿证据（命令 + 数字）、三条命令结果、与 SPEC 不一致或拿不准的地方。
