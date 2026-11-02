# 023 CARD-B — 粘贴超出末尾自动延长（plan-web）

先读仓根 `CONTEXT.md`（注意「延长」与「后移」区别），再读本目录 `SPEC.md` 与 `AMEND-auto-extend.md`。AMEND 是本卡正典。**依赖 backend 058 合入 staging；联调前确认本地后端含 058。**

## 目标

连续多天粘贴超出计划末尾时，在本地自动补整周（上限 52）后再落位；草稿随自动保存、已发布随「更新计划」写入 `plan_weeks / end_date`；修复已发布计划上被盖住的跳过 / 延长提示。

## 文件范围

- `src/features/plan-editor/selectionModel.ts`（落位 + 需补周数，纯函数）
- `src/features/plan-editor/PlanEditor.tsx`（`pasteSelectedDay` 多天分支：补周 + 落位在同一次 `setWeeksWithHistory` 内完成；状态文案优先级）
- `src/features/plan-editor/reconcile.ts`（已发布更新：仅当周数比服务端多时附带 `plan_patch: { plan_weeks, end_date }`，永不带 `start_date`）
- 新增周的生成复用现有「加一周」/ 周标签逻辑（`mapping.ts` 等），不另写一套日期计算。
- `src/i18n/strings-editor.ts` 新文案 + `npm run gen:zh-hant`。
- 测试：`selectionModel` 单测、`multiday-selection-ui.test.tsx` 或新建同风格文件、`reconcile.test.ts`。

## 约束

- 一次粘贴 = 一次 undo 记录（补周与落位同一个 history 条目）。
- 不改开始日、不动已有的天；补出的周为空训练周（休息日），只放粘贴落进来的天。
- 工具栏周数控件的锁定规则不变。
- 已发布计划不自动保存（现状）；只在「更新计划」时写。
- 写入顺序：`plan_patch`（延长）必须在同一 batch 前导或之前完成，保证新周的天不被后端以超出周数拒收。

## 验收标准

AMEND「验收清单」1–9；第 3 条两端 App 由 Opus 收货时做。

## 测试 seam

见 AMEND「测试 seam」三层，先红后绿。

## 交付

- 分支 `feat/023b-paste-auto-extend`，一个 PR（base `main`），不合并。
- JOURNAL：`docs/journal/<日期>-023-paste-auto-extend.md`。
- 闸门：`npm test` 全量、`npx tsc --noEmit`、`npm run build`、`git diff --check`。pinyin 性能用例在高负载下会超时，报告即可，不要改。
- git commit/push 若被沙箱拦截，保留工作区改动交 Opus。
