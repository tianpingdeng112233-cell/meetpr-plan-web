# Block 列日期顺序排障 · 2026-10-29

范围：只改展示与列模式推导，不改 day 的 dow、日期或开始日起每七天分周规则；不 commit / push / PR。
现场：分支 fix/block-column-calendar-order，HEAD 6fb04f9，开工工作区干净；已读 CONTEXT、CLAUDE、工程规约、记忆索引与 diagnosing-bugs / tdd。本次用户明确指定 buildBlockGrid / PlanEditor 为复现入口，采用其公开输入输出及组件 DOM 为测试 seam。

## Phase 1 · 反馈环（进行中）
先用三周完整输入与 startDate；仅查阅已有测试以构造输入，不读取实现、不提出根因假设。目标断言为列头周二/周三/周六/周日、每行日期递增与对应 D 号。没有已跑红命令前不进入 Phase 2。

Phase 1 完成判据：达成。已跑命令 `npx vitest run src/features/plan-editor/blockGridModel.test.ts -t 'reported October'`。
- 仅 weeks（三周）+ startDate：1 passed / 25 skipped，592ms。
- 只增加 weekdays = [5,6,1,2]：1 failed / 25 skipped，575ms；实际列 [5,6,1,2]，W1 = 10/31、11/1、空、空，W2 = 11/7、11/8、11/3、11/4。D 号实际 W2 = [3,4,1,2]。同反馈日期/列头症状吻合；反馈写的 W2 D3/D4 也由此复现。
- 当前为公开模型入口的构造状态复现，尚未证明该用户浏览器确有该设置；后续须覆盖真实 localStorage → PlanEditor 调用链。

## Phase 2 · 复现与最小化（进行中）
原始三周测试保留，另用临时模型测试逐项切输入；每次只改一个条件。

Phase 2 完成判据：达成。
- 原始命令第二次同样 1 failed，751ms，确切症状可重复。
- 只移除 weeks 数据：空 weeks + 原四列仍红（659ms），因此导入、shiftedToDate、initialWeeks、extraWeekdays 都不是这个列顺序失败的必要条件。
- 只缩减列集合到 [5,1]：仍红（期望 [1,5]）。再移除逆序对的一端到 [5]：绿。最小承重条件是显式列设置中存在逆序对；固定 startDate 作为日历坐标参照。原始三周场景保留用于回归，不用缩小后的测试冒充完整用户症状。

## Phase 3 · 排序假设
1. H1：若显式 weekdays 顺序未经日历规范化便作为展示顺序，则仅把 [5,6,1,2] 换成 [1,2,5,6] 会消除症状；localStorage 提供前者也应能在真实 PlanEditor DOM 重现。
2. H2：若自动模式的序数投票或 extras 合并也能产生逆序，则不用显式设置、改为首周较短/部分 initialWeeks 或 extras 时仍会红；若均绿，此项不能解释本次已复现路径。
3. H3：若 weekday（星期）与 dow（开始日起偏移）混用导致倒序，则仅改变 startDate 的星期、保留数据坐标会改变排序规律；应按相对 startDate 的偏移排序而非固定周一。
4. H4：若列变换改了 day 关联或 D 号语义，则只调整展示顺序会造成日期、处方或换天操作对象变化；若原始 weeks 完全不变且换天/填充/按天排测试通过，可排除该解释。

Phase 3 完成判据：达成。四个假设有单变量预测，已排序；按 H1 优先继续，不等待确认。

## Phase 4 · 单变量探针
- H1：组件命令 `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx -t 'reported October'`：1 failed / 2 passed / 62 skipped，1.09s。只换 localStorage `meetpr.plan-editor.weekdays.column-order` 的值，null 与 [1,2,5,6] 均绿，[5,6,1,2] 红；DOM 列头及三周日期/D 号逐字复现反馈，包括 W1 两张空卡的 10/27、10/28。探针日志只加在测试边界，带指定前缀。
- H2：原三周自动推导 [1,2,5,6]；只留首周得到 [5,6]；只加入 extras=[1,2] 仍 [1,2,5,6]。额外枚举两个周的非空星期集合，发现 [[2],[0,1]] 可投票为 [2,1]，说明同一个排序缺口也可能接收自动推导的逆序。不改原有不规则日期的 fallback 落槽规则（有现存回归约束）。
- H3：只换 startDate（周一 → 周五），显式 [5,6,1,2] 的输出原样不变；周一错、周五对。不是日期数据被改错，而是未将列顺序归一到开始日的星期。
- H4：模型按 weekday 匹配 day，dayNumber 由真实日期排序获得；patternIndex 被 changeBlockPattern / onWeekday 用来定位原模式槽。修复不能重编号 patternIndex，否则换天可能改错处方。
- 来源核对：loadBlockWeekdays 只校验值域，PlanEditor 优先采用它；onWeekday 按原 patternIndex 替换星期并保存数组，不排序。导入当前 HEAD 仍为 spec 002 的 buildWeeks，按 dow=0..6 建树，旧列设置仍可继续影响展示。spec 015 尚在独立 worktree（已读其 SPEC §2 与 aiWeeks/saveBlockWeekdays 接线），不是本次 HEAD 的实现；其复用 buildWeeks 后同样进入该展示边界。当前仓及 MeetPR specs 未找到 092 文本，不虚构其条文；已核对本仓实际换天写入路径。

Phase 4 完成判据：达成。H1 在模型和真实 localStorage→PlanEditor→BlockGrid 路径被证实；H2 暴露同一边界的另一个输入来源；H3 确定排序参照；H4 明确保留模式身份。尚无真实用户 localStorage 导出，不能断言用户本人是通过哪一次操作生成该值。

## Phase 5 · 修复与回归（进行中）
正确 seam：模型公开入口 + 真实 PlanEditor DOM（只替换浏览器存储与外部 API），无需 mock 内部列算法。模型原始三周测试和组件三组对照均已先红；补开始日非周一、extras、换天身份与存量输入不变断言后再改实现。

- 修前新增模型三条：3 failed / 25 skipped（608ms）；组件存储对照 1 failed / 2 passed。
- 修复：在 buildBlockGrid 合并所有列后，仅按 `(weekday - firstWeekday + 7) % 7` 排列列对象并重置展示 dx；patternIndex 保持指向原数组槽。day.dow、推荐日期、week.num、处方数据均不改。PlanEditor 无需额外状态迁移。
- 老用户自愈：每次打开、重渲染均在展示边界纠正旧数组；不依赖 localStorage 写权限，不删除或回写旧值，不触发计划 autosave。以后换天仍按 patternIndex 写原设置，展示再次自动归一。
- 首轮四文件专项：104 passed / 2 failed。两个旧测试把「改周一为周四后仍显示 周四/周三」写成期望，这与本次列排序要求直接冲突；按新列位置选回原来的周四处方继续第二次换天，保留对处方 id 与 dow 的全部检查。单日例外仍留在原模式槽（例如把周四单日改周二，列头仍周四），未扩大成所有例外日/跨周后移日期的重排；原需求三周场景每行递增已完整验证。

Phase 5 完成判据：达成（本次反馈三周场景）。修复后原始命令 1 passed / 27 skipped；组件场景 + 连续换天 5 passed / 60 skipped；新增回归已经先红后绿，模型测试证明非周一起始、extras 和换天模式身份不变。未改开始日起每七天分周规则、day.dow 或日期数据。

## Phase 6 · 清理与验证
- 原始命令最终重跑：`npx vitest run src/features/plan-editor/blockGridModel.test.ts -t 'reported October'` → 1 passed / 27 skipped，1.06s。
- `npx tsc -b` → exit 0；生成的 tsconfig.tsbuildinfo 已清除。
- `npm test` 首跑 → 107 files 中 106 passed / 1 failed；1192 passed / 1 failed，16.19s。唯一失败为未改动的 `pinyin.test.ts` 性能断言，1179.98ms > 固定阈值 1000ms；不是测试 timeout，未放宽阈值或改该测试。
- `npm test -- --maxWorkers=2 --minWorkers=1` 全量低并发复跑 → 107 files passed，1193 tests passed，23.36s；pinyin 7/7（文件 261ms）；by-day-layout-ui 19/19（518ms）。其他换天、保存、填充、复制、导入相关现有测试均在此轮覆盖。
- `npm run build` → exit 0；Vite build 8.73s，只有现有资源体积警告。
- `git diff --check` → exit 0；`rg '\[DEBUG-' src` → 无命中（exit 1 为正常空结果）。临时探针测试、浏览器 harness、静态打包产物全部删除，正式新增回归保留。
- 浏览器视觉验证未完成：本地 Vite 启动被沙箱拒绝监听（listen EPERM 127.0.0.1:5188）；随后本地静态页被自动浏览器安全审查拒绝，原因是 file 协议不在允许的 HTTP(S) 协议内。停止该路径，无绕过；无截图、不宣称浏览器亲验通过。真实 React DOM 组件断言已完成。
- 最终工作区仅下述三份代码/测试与本 JOURNAL；没有 commit、push、PR、部署或线上数据写入。

Phase 6 完成判据：用户列出的清理条件均达成；原始复现与回归绿、临时探针/日志已清理、被证实假设如下。仓规要求的浏览器视觉证据仍为环境阻塞缺口，不将组件 DOM 验证冒充截图或线上验收。

## 独立审查
使用 review-loop 本地双轴流程；本仓缺少 docs/agents/issue-tracker.md，未声称执行依赖该配置的 Matt tracker 流程，已告知后续由 David 调用 setup-matt-pocock-skills 配置。
- Standards：独立只读 reviewer，0 findings；模型+UI 93/93 passed，diff check 通过。
- Spec：独立只读 reviewer，0 代码 findings；模型+UI 93/93 passed。范围边界：现有单日例外仍按原模式槽落列；例如周四单日改到周二时，可能显示周三后接周二。若“任何一行”意在覆盖任意单日例外与跨周后移，还需额外决定其与固定星期列的关系；本次不擅改这些既有手势规则。反馈给出的三周场景全部满足。

## 交付
根因一句话：buildBlockGrid 将持久化列模式或序数投票顺序直接作为展示顺序，缺少按计划开始日星期归一化，导致逆序设置 [5,6,1,2] 在所有周复现周六/周日排到周二/周三前。

被证实的假设：H1；同一数据只切换存储列设置即可使真实组件红/绿，H2 另证自动推导也能提供逆序输入。未获得用户实际 localStorage，不能断言其设置的历史形成过程。

改动文件：
1. `src/features/plan-editor/blockGridModel.ts`：仅排序展示列；保留模式原槽 patternIndex。
2. `src/features/plan-editor/blockGridModel.test.ts`：新增 3 条模型回归（完整症状、周五开始、extras 与换天身份）。
3. `src/features/plan-editor/block-grid-ui.test.tsx`：新增 3 组真实存储→组件回归；调整原 2 条换天测试的显示位置期望，保留 row id/dow 身份检查。
4. `docs/journal/2026-10-29-block-column-order.md`：本卡六阶段证据、边界、审查与验证。

核心实现 diff（3 行新增）：
```diff
+  // Saved patterns and ordinal votes can be out of calendar order. Normalize
+  // display positions only; patternIndex still addresses the original edit slot.
+  columns.sort((a, b) => ((a.weekday - firstWeekday + 7) % 7) - ((b.weekday - firstWeekday + 7) % 7))
   columns.forEach((column, dx) => { column.dx = dx })
```

最终测试命令与结果数字：原始复现 1/1 passed（27 skipped）；组件定向 5/5 passed（60 skipped）；独立模型+UI 93/93 passed；`npx tsc -b` exit 0；`npm test` 首次 1192 passed / 1 性能失败，`npm test -- --maxWorkers=2 --minWorkers=1` 最终 107/107 files、1193/1193 tests passed；`npm run build` exit 0。共新增 6 个测试 case，4 个在修前失败、2 个为无缓存/正确缓存对照。
