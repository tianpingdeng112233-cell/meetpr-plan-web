# 002 · 教练计划 xlsx 导入(网页编辑器)

**Status:** Design(brainstorm 冻结 2026-06-27;review-loop R1 收 5 BLOCKER 已修,待复审)
**App:** `apps/meetpr-plan-web` · **开发交接:** Codex(本 spec 即实现契约)
**承接:** spec [001](../001-plan-editor-web/SPEC.md) §非目标(.xlsx 导入排 V1.1)+ §开放/后续(复用 parser + 版式识别)。

## Goal

教练在网页编辑器里**上传手写 xlsx 训练计划(WPS/Excel)**,前端当场解析、**替换当前打开计划的网格**;教练核对、绑未匹配动作、改逐组数值后,走**现成保存**(`reconcilePlan`)写回后端。

格式理解 + 解析规则复用 iOS spec 043 硬化验证过的同批真实文件。**dev fixture = `邓天平.xlsx`**。

## 非目标(YAGNI / 本步边界)

- **不写 per-set `coach_note` / `failed` / `backoff`**:编辑器模型(`SetBox{val,empty}` + 行级 `note`)与 `reconcile` 当前只支持「逐组 val + 行级 note + 末组 amrap(reps 带 `+`)」。导入**降级**到这个能力面:`力竭`/`70%top`/`tempo`/解析不掉的串 → **行级 `note`**(教练可见可改),**不**扩 `SetBox`/UI/wire。扩 set_type/coach_note 全链路 = 后续 spec。
- **不新建计划**:导入**替换当前打开计划**的内存 `Week[]`。
- **plan_weeks 对齐**:本步保存复用现有 `reconcile`。导入**截取到当前 `plan.plan_weeks`**:原表周数 > 计划 → 只填前 `plan_weeks` 周 + UI 提示(「原表 N 周、当前计划 M 周,已填前 M 周;要导全先把计划周数调到 N」);原表更少 → 填到实际周数即可。**网格显示范围 = 保存范围一致**,`reconcile` 不会撞后端 `week_number ≤ plan_weeks` 约束而保存失败。更新 plan_weeks 以容纳全部周 + 清掉超出周 = 紧随其后一小步(见 §开放)。
- **%top / 训练最大值**;**同格多动作 `+`/换行拆分精修**(拆不动整串进行级 note);**服务端解析**。
- **不追求逐组精准**:拿不准降级进 `note`,教练在网格改——设计前提。

## 依赖决策(BLOCKER R1-3)

- **包**:`xlsx@0.18.5`(SheetJS Community,Apache-2.0;npm `latest` 即此版)。若该版读 WPS 失败,改用 SheetJS 官方分发源(`cdn.sheetjs.com`)较新版——**构建期装进本地依赖 / vendored,不在运行时从 CDN 远程加载**(避免可用性/CSP/供应链差异);二选一在 smoke test 里定死。**lazy import**(动态 `import('xlsx')`,只在点导入时加载,不进主 bundle)。
- **WPS 可读性必须先验证,不靠"宽容"赌**:**第一个实现任务** = 写一个 smoke test 用 SheetJS 读一份**真 WPS 生成的 .xlsx**(committed 小 fixture,见 §测试),断言能拿到 sheet 名 + 单元格。**通过才继续**。
- **失败回退**:若 SheetJS 读不了 WPS,则把 iOS 的 `WPSWorkbookSanitizer`(剥 `.rels` 里非 CoreXLSX-supported relationship)思路移植成 TS 前置清洗;**预期不需要**(openpyxl/SheetJS 类宽容库能读),但范围内保留此回退。

## 类型契约(BLOCKER R1-4;新模块 `src/features/plan-editor/import/`)

```ts
// 单元格 / 网格(SheetJS → 内部 seam)
interface Cell { row: number; col: number; text: string }          // 1-based;text=trim 后字符串
interface Grid {
  maxRow: number; maxCol: number
  occupiedRows: number[]                                            // 升序、去重、有 cell 的行
  text(row: number, col: number): string                           // 空 → ""
  numeric(row: number, col: number): number | null                 // 按 text 内容解析(WPS 把数字写成 text)
}

// 中间模型(parser 产出 → buildWeeks 消费)
interface ParsedExercise {
  rawName: string
  reps: string                                                     // "8" / "8+"(amrap)/ "—"(无结构)
  mode: 'kg' | 'rpe'
  values: string[]                                                 // 逐组 val,规范化字符串;length=组数;无结构=[]
  note: string                                                     // tempo/力竭/解析不掉的串(行级)
}
interface ParsedDay { dayOfWeek: number; rest: boolean; exercises: ParsedExercise[] }  // dayOfWeek 0..6
interface ParsedWeek { blockIndex: number; dateSerials: (number | null)[]; days: ParsedDay[] }
```

## 模块函数(纯函数,TS 签名 = TDD 契约)

| 函数 | 签名 / 契约 |
|---|---|
| `readWorkbook` | `(buf: ArrayBuffer) => { name: string; grid: Grid }[]`。SheetJS 读 → 每 sheet 一个 `Grid`。 |
| `detectDayOffset` | `(grid: Grid) => number`。日列起始列;**stride=5 固定**,搜索 **offset ∈ 1..5**,选「该 offset 下日期行最多」者,平局取小,空网格默认 1。**日期行** = 该行在 `offset, offset+5, …`(7 个日名列)中 **≥3 个** `numeric(...) >= 10000`(大数序列,排除 reps/weight/RPE)。 |
| `selectSheet` | `(sheets: {name;grid}[]) => Grid \| null`。对每 sheet:detectDayOffset → 切周块 → 取**有 `contentRows`(非空内容行)的周块**;有则候选,recency = 这些周块所有 `dateSerials` 的最大值。返回 recency 最大者;无候选 → null。（邓天平→`2026`;跳 `注意事项`/旧 `2025`) |
| `weekBlocks` | `(grid: Grid, offset: number) => { headerRow; dateSerials; contentRows }[]`。日期行开块;`contentRows` = `occupiedRows` 中落在 (headerRow, 下一 headerRow) 且在 7 日跨度内非空的行。 |
| `parseSetLine` | `(setsCell, intensityCell, float1, float2) => { reps; mode; values; amrap; note }`。`组*次`(`4*8`)定组数+reps;逐组重量 `110/115/120/120`→values、爬坡 `80→90 +5`→铺、广播单值;RPE 串 `6788`→`['6','7','8','8']`(`rpe` 标记列定 mode);**仅字面 `amrap`** → `amrap=true`(reps 末尾加 `+`,经 `reconcile` 落 backend `set_type='amrap'`);`力竭`/`降组`/`70%top`/tempo/`长暂停2s`/解析不掉的串 → **行级 `note`**(本步不写 `failed`/`backoff`,见 §非目标)。**数值内部可算,写入 `values` 必须是规范化字符串**(不传 number)。 |
| `parseDay` | 按 `dayColumns(dayIndex, offset)` 逐行读;`休息`→rest;空名+有组次=续行追加上一动作;多行名(换行)→逐行一动作。 |
| `buildWeeks` | `(parsed: ParsedWeek[], index: ExerciseIndex, planWeeks: number, startDate: string) => Week[]`。**空周(无动作)滤掉**;余下 week_number 从 **1 顺排**、**截取到 `planWeeks`**(见 §非目标)。展示字段(`num2`/`range`/`isCurrent`/`dowLabel`/`dateLabel`)由 `startDate` 计算(**复用 `mapPlanToWeeks` 的日期逻辑**);**xlsx `dateSerials` 只用于 sheet 选择,不用于展示**——计划按 plan 的 `start_date` 重新定日(同 iOS spec 043)。每动作 `index.resolve(rawName)`:命中 → `exerciseId=resolved.id`、`custom = resolved.created_by_coach_id != null`、`ku = !custom`、`isMain = resolved.is_competition_lift \|\| resolved.main_lift_family != null`;**未命中 → `exerciseId:null, ku:false, custom:false`**(待绑定)。`boxes` 由 `values` 生成;`reps`/`mode`/`note` 照搬;无结构动作 `aux:true`。 |

> `dayColumns(d, offset) = { nameCol: offset+5d, setsCol: +1, intensityCol: +2, float1: +3, float2: +4 }`(1-based)。

## 导入数据流(C;BLOCKER R1-2)

1. `TopBar` 加「导入 .xlsx」按钮(新 prop `onImport`)→ `<input type=file accept=".xlsx">`。
2. `file.arrayBuffer()` → `readWorkbook → selectSheet`(null→提示「没识别出训练周,请确认选的是计划表」,不崩)→ `detectDayOffset → weekBlocks → parseDay → buildWeeks(parsed, index, loaded.plan.plan_weeks, loaded.plan.start_date)`。
3. 当前网格非空 → **确认覆盖**弹窗。
4. `PlanEditor` 暴露导入 → `setWeeks(parsedWeeks)` **替换**内存 weeks(week_number 从当前计划 W01 顺排到 WN)→ 教练核对/绑未匹配/改逐组 → 现有「保存」→ `reconcilePlan(planId, weeks)`(受 §非目标 plan_weeks 限制)。

## 复用现成件(Explore 确认在)

`ExerciseIndex.resolve`(**精确**:trim 后精确 catalog 名或精确 alias;非模糊/大小写归一)+ `src/data/exercise-aliases.json`、`SetBox` 逐组模型、`reconcile.ts`、`mapPlanToWeeks`(反向参照)。

## 容错 / 降级

- 动作未命中:`exerciseId:null, ku:false, custom:false` → 教练用现有绑定 UI 绑(保存时 `exerciseId:null` 的行被 `reconcile` 跳过,符合预期)。
- Decimal:一律字符串往返;parser 内部可算,写 `SetBox.val` / `CreatePlanSetBody.target_value` 必须规范化字符串(不传 number)。

## 测试(TDD)

- **smoke(先行)**:SheetJS 读 committed 的真 WPS fixture(一份 WPS 另存的 2 天迷你计划 `.xlsx`,放 `src/features/plan-editor/import/__fixtures__/`)→ 断言拿到 sheet + cell。
- **纯函数单测**(合成 `Grid`):`detectDayOffset`(offset 1 vs 2、文本型大数序列、小数字不误判)、`selectSheet`(recency + 跳无内容页 + 文本序列)、`parseSetLine`(组次/逐组重量/RPE 串/爬坡/**仅字面 amrap→reps `+`**、**力竭/降组→行级 note**、tempo→note)、`buildWeeks`(空周滤、命中绑定、**未匹配→exerciseId:null/ku:false/custom:false**、别名 canonical 必须在 catalog 内)。
- **端到端**(dev,本地;**当前计划 `plan_weeks=14`**):`邓天平.xlsx` → 网格 14 周、深蹲/卧推/硬拉带重量、未匹配可见可绑。

## 开放 / 紧随其后

- plan_weeks 对齐 + 清掉超出周(保存语义完整化)。
- per-set `coach_note`/`failed`/`backoff` 全链路(扩 `SetBox`/UI/`mapPlanToWeeks`/`reconcile`)。
- 同格多动作 `+`/换行拆分精修。

## Refs

- iOS spec 043 硬化(同格式 Swift 实装 + review-loop 3 轮 CLEAN):`~/Brain/wiki/projects/MeetPR/reviews/2026-06-26-coach-plan-import-format-hardening.md`;邓天平 capstone phase=review/14 周/246 动作。
- spec 001 §解析规则 / §强度列(DSL 映射表)。
