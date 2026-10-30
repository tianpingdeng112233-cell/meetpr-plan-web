# 导入开始日取首个训练日 · 2026-10-29

## 任务与现场

- 按本次用户明确任务实施：带日期表以首个有处方内容的格子的日期作为计划开始日，按开始日起每 7 天重新分周，保留所有训练日期、处方内容与顺序。无日期及手选开始日的原路径不变。
- 已先读仓根 CONTEXT.md，再读 CLAUDE.md、全局工程规约、记忆索引与 tdd / code-review / review-loop 技能。仓内没有 FOLLOWUPS.md，也没有本任务独立 spec；本次用户提供的目标、约束、测试 seam 与验收清单为实现依据。
- 工作树 `meetpr-plan-web-wt-import-start`，分支 `fix/import-start-first-training-day`，基线 `a56da09`；开工 `git status --short` 干净，已核对 worktree 与最近 10 条提交。
- 测试 seam：现有导入公开入口 `buildWeeks` / `importStartDate`；保存一致性复用 `reconcileImportedPlan` 的 API 边界测试。未读取或修改线上计划数据。

## 改动文件

1. `src/features/plan-editor/import/index.ts`：提取处方对应的源日期，以首处方日定 startDate；按真实日期差重新分配 week/dow，以最后处方所在周计算周数。缺失单格日期沿用同周列日期推导；Excel 时间小数归一为日历日后计算偏移。保留最近 12 个源周行的选择规则、内部空周与每周 7 天补空规则。
2. `src/features/plan-editor/import/import-dates.test.ts`：新增 9 个 case（含 3–6 源周的 4 个参数化 case），增强原周一对照；覆盖每日日期和处方顺序、W1 六日二三、无日期、首部空周/休息日、完整末周、缺失日期格和时间小数。使用真实 ExerciseIndex。
3. `src/features/plan-editor/reconcile-import.test.ts`：新增 1 个导入→保存测试，断言 20 个训练日的持久化坐标，及 `start_date=2026-10-31`、`plan_weeks=5`、`end_date=2026-12-04` 一致。
4. 本 JOURNAL：本卡范围、测试与独立审查证据。

## Red → green 与验证

- 首轮命令：`npm test -- src/features/plan-editor/import/import-dates.test.ts --maxWorkers=2 --minWorkers=1 --testTimeout=60000`。改实现前 **4 failed / 7 passed（11）**，均为实际 `2026-10-26`、期望 `2026-10-31`；3–6 周同一行为均复现。
- 最小修复后日期与已有导入两文件 **51/51 passed**；增加对照及保存测试后 **60/60 passed**。
- Standards 审查发现 Excel 日期含不同时间小数时偏移不为整数，会丢处方。先新增回归，原日期命令 **1 failed / 15 passed（16）**，期望 8 个训练日、实际仅首日；将 serial 按日取整后绿。
- 最终专项：`npm test -- src/features/plan-editor/import src/features/plan-editor/reconcile-import.test.ts --maxWorkers=2 --minWorkers=1 --testTimeout=60000` → **3/3 files、61/61 tests passed**。
- `npx tsc -b` → **exit 0**。首次曾因新增保存测试 fixture 的 `exercise_type` 枚举值不合法失败，修为 `main_lift` 后重跑通过；生成的 `tsconfig.tsbuildinfo` 已清除。
- 最终全量：`npm test -- --maxWorkers=2 --minWorkers=1 --testTimeout=60000` → **107/107 files、1203/1203 tests passed，25.11s**。相对基线新增 **10 cases**。时间小数返修前全量为 1202/1202，通过后按最终代码重跑。
- 最终 `npm run build` → **exit 0**，Vite **1.96s**；仅有资源 chunk 超过 500 kB 的体积提示。首次构建同受上述测试 fixture 类型错误阻断，修正后通过。
- `git diff --check` → **exit 0**。本次仅导入数据逻辑与测试修改，没有视觉/UI 修改，未进行浏览器或线上验收。

## 独立审查

使用 review-loop 本地双轴只读审查；仓内缺 `docs/agents/issue-tracker.md`，已告知后续可运行 `$setup-matt-pocock-skills`，未私建 tracker 或声称执行其远端流程。审查报告随本卡记录于此。

- Standards：初审 1 项（时间小数可能丢处方）；先红后绿返修，独立复核 **0 未决 findings**。
- Spec：初审及时间小数补丁复核均 **0 阻塞 findings**；现有导入提示误报见下方范围备注。

## 行为与范围备注

- 示例源表从周一 10/26 起排、首练 10/31，末行只到周三 12/2：6 源周重排为 5 训练周，W1 为 10/31、11/1、11/3、11/4；日期和所有处方保持不变。若末行周六 12/5、周日 12/6 仍有处方，则必须保留第 6 训练周，不能为了 6→5 截掉内容。末周按既有规则补满 7 天。
- `PlanEditor.tsx:2788` 的既有提示判断用源周行数减新周数。正常 6→5 也会弹出“只导入最新一期共 5 周”类截断提示，实际没有丢处方。本次遵守“不改编辑器”边界，仅记录，待后续处理提示判断。
- 只影响之后执行的导入；没有存量计划迁移，也没有修改编辑器、后端或“从开始日起每 7 天一周”的规则。
- spec 015 智能导入位于独立 `feat/015-sheet-import` 工作树，不在本次基线实现内；其按周一定起点的同类问题留待该分支处理，本次未修改。
- 没有 commit、push、PR、部署或线上写入；以上是开发自测与自审证据，不代替 Opus 收货验收。

## 收货返修 · 正常重分周不报截断

2026-10-29 用户接受其余实现，要求修掉上述假截断 alert，并明确放开“不改编辑器”约束，仅限该提示判断。本节更新前文“提示误报留待后续”的状态：**误报已修复**，其余实现与范围不变。

### 修改

- `src/features/plan-editor/import/index.ts`：`buildWeeks` 增加返回 `droppedSourceWeeks`，在重分周之前计算原始输入与 `latestCalendarWindow` 保留输入的含处方源周数差；空周不计为丢弃处方，输出周数变化不参与截断判断。
- `src/features/plan-editor/PlanEditor.tsx`：只以 `droppedSourceWeeks > 0` 决定截断状态和 alert；文案中的导入周数仍取 `nextWeeks.length`。没有改其他编辑器交互、文案模板、保存或后端。
- `src/features/plan-editor/locked-ui.test.tsx`：检索未发现现有 `importTruncated/importedUnsaved` 测试，因此复用已有 PlanEditor 文件导入测试所在文件及 React DOM harness。新增 3 个真实 XLSX→文件 input→解析→PlanEditor 用例，不 mock 导入模块：6 源周→5 周不 alert 且状态为 `importedUnsaved(5)`；13 连续源周真正截断时 alert；13 个日历源周内只有第 1/2/13 周有内容时，丢弃第 1 周仍 alert，即便保留窗口的 12 个输出周大于源表含处方周数。
- `src/features/plan-editor/import/import-dates.test.ts`：在现有 3–6 周重分周用例断言 `droppedSourceWeeks=0`，在 27→12 源周窗口用例断言丢弃 15 个含处方源周。

### Red → green 与最终验证

- 红测试：`npm test -- src/features/plan-editor/locked-ui.test.tsx -t 'imports six source weeks' --maxWorkers=2 --minWorkers=1 --testTimeout=60000` → **1 failed / 20 skipped**，实际 alert 为“原表 6 周，只导入最新一期共 5 周（10/31–12/4）”。
- 修改实现后同命令 → **1 passed / 20 skipped**，状态断言为 `importedUnsaved(5)`，alert 未被调用。
- 增加真实截断对照后，`npm test -- src/features/plan-editor/locked-ui.test.tsx src/features/plan-editor/import src/features/plan-editor/reconcile-import.test.ts --maxWorkers=2 --minWorkers=1 --testTimeout=60000` → **4/4 files、84/84 tests passed**。
- `npm test -- --maxWorkers=2 --minWorkers=1 --testTimeout=60000` → **107/107 files、1206/1206 tests passed，23.30s**；本轮新增 3 个 UI case，本卡累计新增 13 个 case。
- `npx tsc -b` → **exit 0**；生成的 `tsconfig.tsbuildinfo` 已清除。
- `npm run build` → **exit 0**，Vite **1.70s**，仅有 chunk 体积提示。
- `git diff --check` → **exit 0**。
- 浏览器亲验未完成：`npm run dev -- --host 127.0.0.1 --port 5188` 被沙箱拒绝监听，`listen EPERM 127.0.0.1:5188`。没有截图，不将 jsdom 组件断言表述为浏览器验证；真实工作簿解析与 PlanEditor DOM/alert 交互已由上述测试覆盖。

### 返修审查与交付

- review-loop Standards 独立只读复核：**0 findings**；计数发生在重分周前，UI 复用结果，无第二套截断规则。
- review-loop Spec 独立只读复核：**0 findings**；正常 6→5 不报截断，真实丢弃仍告警，文案保留实际输出周数，修改符合本轮放开的边界。
- 仍未 commit、push、PR、部署或修改线上数据。前文首轮测试数字保留为历史证据，以本节 **1206/1206** 为最终代码全量结果。
