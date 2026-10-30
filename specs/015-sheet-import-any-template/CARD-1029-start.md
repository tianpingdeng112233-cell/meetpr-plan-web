# 015 卡 1029-start：智能导入的计划从第一个有处方的日期起算

先读仓根 CONTEXT.md。

## 背景
2026-10-29 教练反馈：表格导入把开始日定为表格首列日期（周一），而 MeetPR 的「周」= 开始日起每 7 天，于是周一起排、首周只有周末有内容的表格，会让计划第一行混进两个训练周。普通表格导入已在 main 修好（plan-web #138，merge e3fe263，提交 72e423e；JOURNAL `docs/journal/2026-10-29-import-start-first-training-day.md`，在 origin/main 上）。本分支（feat/015-sheet-import，PR #126）的智能导入有同样问题：`ImportPlanDialog.tsx` 的 `create()` 有日期时用 `goodWeeks[0].start_date`（后端 052 返回的那周周一）当 `start_date`，并以 `selected.length` 当 `plan_weeks`。

## 目标
有日期的智能导入：计划开始日 = 第一个有处方的日期；按新起点每 7 天重新分周；每条处方的日历日期与内容不变；周数可能因此变少（或不变），不得因此报「截断」类提示。

## 范围
- `src/features/plan-editor/import/index.ts`：把 #138 的 `weekStartSerial / datedTrainingDays / importStartDate / regroupDatedWeeks` 与 `buildWeeks` 返回 `droppedSourceWeeks` 移植过来（本分支与 main 有冲突，不要整体 merge main，只移植这一块；与本分支已有改动对齐）。
- `src/features/plan-editor/PlanEditor.tsx`：普通导入的截断判断随 #138 改用 `droppedSourceWeeks`（同一 `buildWeeks` 签名，顺手对齐）。
- `src/features/plan-editor/import/ImportPlanDialog.tsx`：`create()` 先 `buildWeeks` 再 `createPlan`；有日期（`!needsFirstDate`）时 `start_date` 用 `built.startDate`、`plan_weeks`/`end_date` 用 `built.weeks.length`；`planStartDate`、`reconcileImportedPlan`、`weekdays` 的锚点同步用新起点。`needsFirstDate`（无日期/序数周）路径行为保持不变。摘要行 `mmdd(goodWeeks[0]?.start_date ...)` 显示的日期也应是第一个处方日（有日期时）。
- 不改后端；`prompts.ts`「有日期返回这周周一」保留。

## 约束
- 不丢内容、不改任何处方的日期；空周窗口内的空天照常补休息日。
- 创建失败重试（`createdRef` 已建计划）路径不能因为先 build 而行为退化。
- 不 commit、不 push。

## 测试 seam（先红后绿）
1. `import-dates.test.ts`（或 aiWeeks 相邻测试）在 `aiWeeksToParsed → buildWeeks` 边界：周一起排的 AIWeek 序列，第一周只有周六、周日有处方，之后每周周二、周三有处方，共 6 个源周 → `startDate` 为该周六，W1 的天 = 六、日、二、三，共 5 周，`droppedSourceWeeks === 0`。
2. `ImportPlanDialog.test.tsx` 在对话框边界：同形状识别结果 → `createPlan` 收到的 `start_date` 是周六、`plan_weeks === 5`、`end_date` 对应 5 周；页面无 alert/截断文案。
先跑一遍看到这两条红，再实装转绿。

## 验收
- 上两条测试先红后绿；`npx tsc --noEmit`、`npm test`、`npm run build` 全绿。
- JOURNAL 写在 `docs/journal/2026-10-29-015-start-first-training-day.md`：改了什么、红绿证据（命令+计数）、残留风险。
