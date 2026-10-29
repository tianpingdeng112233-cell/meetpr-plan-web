# 015 卡 1029-start：智能导入从首个处方日起算

## 任务与现场

- 依据 `specs/015-sheet-import-any-template/CARD-1029-start.md`；先读 `CONTEXT.md`，再读 `CLAUDE.md`、015 SPEC、工程规约、记忆索引及 TDD / code-review / review-loop 技能。本仓未找到 FOLLOWUPS.md。
- 工作目录 `/Users/david/Projects/apps/meetpr-plan-web-wt-015`，分支 `feat/015-sheet-import`，基线 `8e309c1`。已核对 worktree、status 和最近 10 条提交。开工唯一未跟踪文件是用户提供的任务卡，保持原样。
- 已读 `git show 72e423e` 与 `git show origin/main:docs/journal/2026-10-29-import-start-first-training-day.md`，仅移植相关逻辑，未 merge main、commit、push，未修改其他 worktree、后端或线上数据。

## 修改文件与分支适配

1. `src/features/plan-editor/import/index.ts`：移植 `weekStartSerial`、`datedTrainingDays`、`importStartDate`、`regroupDatedWeeks`。全有日期时以首处方日为起点，每 7 天重新分周，保留真实日期、处方及每周 7 天休息日占位；按日取整 Excel 时间小数。无日期或混合输入保留原有槽位逻辑。
2. `src/features/plan-editor/import/ImportPlanDialog.tsx`：先 build 再 createPlan；创建的起止日、周数、anchor，以及快照、reconcile、weekdays 共用新起点。有日期摘要展示首处方日。无日期/序数周保持手选起点和原摘要规则。创建自定义动作后重新绑定，并继续复用 createdRef / addedRef，失败重试不会重复建计划或已成功创建的动作。
3. `src/features/plan-editor/import/import-dates.test.ts`：增加六源周重分五周、日期与处方完整保留，以及前置空周待核对提示的回归。
4. `src/features/plan-editor/import/ImportPlanDialog.test.tsx`：增加同形状创建请求/摘要/快照/实际保存日期/无截断提示测试，创建过程中自定义动作与快照接连失败后重试测试，以及序数周摘要兼容回归。
5. 本 JOURNAL。

本分支与 main 的必要差异：

- 015 已删除 PlanEditor 中普通导入入口、buildWeeks 调用和 importTruncated 判断；本卡该项没有可修改的代码，故未触碰 `PlanEditor.tsx`，也未复活旧入口。
- 本分支已把选周前置到对话框，binder 不再有 `latestCalendarWindow`。`buildWeeks` 增加 `droppedSourceWeeks: 0`，表示没有额外丢弃所选源周；不重新引入 main 的窗口截断策略。
- 015 的显式空周占位及其 `empty_week` 提示继续保留；重分周后提示映射到覆盖原日期的目标周，早于新起点的提示留在 W1。多个源片段若落到同一天，合并处方，避免 Map 覆盖丢内容。这些适配由既有导入测试及本次回归覆盖。

## Red → green 证据

卡内两条测试在任何实现修改前先写入并执行：

```sh
npm test -- src/features/plan-editor/import/import-dates.test.ts src/features/plan-editor/import/ImportPlanDialog.test.tsx -t 'six AI source weeks'
```

- Red：**2 failed / 96 skipped（98）**。纯函数实际 startDate 为 `2026-10-26`，预期 `2026-10-31`；对话框实际创建 `start_date=2026-10-26, plan_weeks=6, end_date=2026-12-06, anchor_weekday=1`，预期 `2026-10-31, 5, 2026-12-04, 6`。
- 实装后相同命令 Green：**2 passed / 96 skipped（98）**。W1 为六、日、二、三，12 个训练日期及对应处方全部保留，droppedSourceWeeks=0，无 alert 或截断文案。
- 首次转绿过程中修正了新增测试的快照断言路径：DraftMirror 使用 `.content.planStartDate` / `.content.weeks`。后续重试测试曾使用当前 Vitest 不支持的 matcher，改为已有的 `toHaveBeenCalledOnce` + `toHaveBeenCalledWith`。这两次是测试编写错误，不计作行为回归证据。
- 扩大专项后，既有空周测试及同日期多段处方测试暴露移植兼容缺口；保留空周标记并合并同日期处方后 **136/136** 通过，再增加重试保护测试。

审查返修也先红后绿：

```sh
npm test -- src/features/plan-editor/import/import-dates.test.ts -t 'leading empty week'
npm test -- src/features/plan-editor/import/ImportPlanDialog.test.tsx -t 'existing summary date'
```

- 前置空周 Red：**1 failed / 8 skipped（9）**，实际 importDoubts 为 undefined，预期 `['empty_week']`。修正目标周下界，提示保留至首输出周。
- 序数摘要 Red：**1 failed / 91 skipped（92）**，实际显示手选 `11-02`，原行为应显示源日期 `10-19`。恢复 needsFirstDate 分支的原表达式。
- 两项返修后的完整导入专项 `npm test -- src/features/plan-editor/import`：**6/6 files、139/139 tests passed**，覆盖上述回归与失败重试。

## 最终验证

| 命令 | 最终结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 105/105 files、1137/1137 tests passed，14.36s |
| `npm run build` | exit 0，Vite 2.44s |
| `git diff --check` | exit 0 |

全量命令的输出分别保留于本机 `/tmp/meetpr-015-start-full-test.log`、`/tmp/meetpr-015-start-build.log`。最终较基线新增 5 条测试。返修前曾通过 1135/1135，以上 1137/1137 为最终结果。

## 独立审查

按 review-loop 对 HEAD 基线的本卡四个代码/测试文件运行两个只读子代理。仓内缺 `docs/agents/issue-tracker.md`，已告知可用 `$setup-matt-pocock-skills` 后续配置；本次使用任务卡做本地双轴审查，没有创建 tracker。

- Standards：初审 1 项，前置 empty_week 提示随起点前移丢失；补回归并返修后，独立复审 **0 未决 findings**。
- Spec：初审 1 项，needsFirstDate 分支摘要显示被改变；补回归并恢复后，独立复审 **0 未决 findings**。已核对 PlanEditor 无普通导入调用、droppedSourceWeeks=0 的分支适配。

## 残留风险与验证边界

- 浏览器亲验未完成：`npm run dev -- --host 127.0.0.1 --port 5199 --strictPort` 被沙箱拒绝监听，报 `listen EPERM 127.0.0.1:5199`。无截图，不把 jsdom 组件/API 边界断言称为真实浏览器验收。
- build 有资源 chunk 超过 500 kB 的提示；没有类型或构建错误。
- 本次为开发自测与自审证据，不代表 Opus 已收货或已上线。未修改后端识别提示词、存量计划或产品正典文档。
