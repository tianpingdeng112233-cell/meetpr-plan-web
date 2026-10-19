# CODEX JOURNAL

## 2026-10-07 — bodyweight / legacy RPE 逐组透传修复（P0 / T1）

- 分支 `fix/opaque-legacy-set-passthrough`；开工 HEAD 与 origin/main 均为 `22cc616`。
- 根因：旧格式组的 opaque 透传携带 `load_mode: null` 等新强度字段，后端按字段存在性选择新格式校验并要求缺失的 `target_weight`，导致整批保存被拒。
- 修改：`opaqueSetToDesired()` 仅在 load mode 非空或 target weight 可用时携带新强度字段；否则保留纯旧强度格式，并逐组保留序号、次数范围、组类型、休息与备注。既有 canonical equality 已满足不写入要求，无需调整；`types.ts` 未改。
- 文件：`src/features/plan-editor/reconcile.ts`、`src/features/plan-editor/reconcile.test.ts` 与本记录。后端仅以 `git show origin/staging:...` 读取两个规则文件；未操作其他仓的工作树。未修改文案、别名或依赖，未 commit / push / 开 PR。
- 测试 seam：现有 plans API mock → `mapPlanToWeeks` → `reconcilePlan` → `batchDays` 请求体；用 `hasOwnProperty` 与严格对象比较验证字段缺席及逐组内容。

### Red（改实现之前，退出码 1）

命令：`npm test -- src/features/plan-editor/reconcile.test.ts -t 'opaque legacy set passthrough' --reporter=verbose`

```text
 × src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves saved bodyweight sets as pure old shape when another row changes
 × src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves saved legacy RPE sets as pure old shape when another row changes
 × src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves copied bodyweight sets as pure old shape in week 2
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > opens saved bodyweight sets without any writes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > opens saved legacy RPE sets without any writes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps legacy weight passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new fixed weight passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RPE passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new pct passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RIR passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RPE range passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new weight range passthrough fields unchanged
 Test Files  1 failed (1)
      Tests  3 failed | 9 passed | 58 skipped (70)
```

三项失败原因均为：`load_mode: expected true to be false // Object.is equality`。

### Green（修复后，退出码 0）

命令：`npm test -- src/features/plan-editor/reconcile.test.ts --reporter=verbose`

```text
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves saved bodyweight sets as pure old shape when another row changes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves saved legacy RPE sets as pure old shape when another row changes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > preserves copied bodyweight sets as pure old shape in week 2
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > opens saved bodyweight sets without any writes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > opens saved legacy RPE sets without any writes
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps legacy weight passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new fixed weight passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RPE passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new pct passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RIR passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new RPE range passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — opaque legacy set passthrough > keeps new weight range passthrough fields unchanged
 ✓ src/features/plan-editor/reconcile.test.ts > reconcilePlan — skippedRows counts only contentful unbound rows > opens a legacy per-set RPE row without autosave rewriting load_mode
 Test Files  1 passed (1)
      Tests  70 passed (70)
```

### 全量检查

`npm test`，退出码 0：

```text
 Test Files  87 passed (87)
      Tests  830 passed (830)
```

`./node_modules/.bin/tsc --noEmit`：无诊断，`TYPECHECK_EXIT_CODE=0`。

`npm run lint`（仓内实际脚本为 `tsc --noEmit`）：`LINT_EXIT_CODE=0`。

`npm run build`：`✓ built in 1.28s`，`BUILD_EXIT_CODE=0`；有 Vite 大于 500 kB 的 chunk 提示，构建成功。

### 自审与执行记录

- code-review 两个独立只读 reviewer：Standards 无发现；Spec 无发现。以任务卡为 Spec，对照 `git diff 22cc616` 审查未提交改动；用户明确不提交，因此未使用 committed three-dot diff。
- 易踩坑：null 字段在 JSON 中不会消失；因此必须整个省略新强度字段。复制测试需按 `cloneRow` materialize 并保留 opaqueSets / opaqueSetBaseline，不能只复制网格。逐组测试使用不同次数、范围、组类型和休息时间，防止被统一。
- 流程：依卡要求先观察前三项全部 red，再修改实现；无需重新调查已确认根因。仓内无 `docs/agents/issue-tracker.md`，已提示可用 `/setup-matt-pocock-skills` 补齐，本卡不依赖 tracker。
- 以上是开发自测与代码自审证据，不代表线上部署或 Opus 收货验收。

## 2026-10-07 — 保存／发布失败提示按真实原因区分（T1）

来源：本次用户任务卡「plan-web 保存/发布失败提示按真实原因区分」。开发交付待 Opus 收货，不代表产品验收或上线。

分支 `fix/save-failure-dialog-reasons`，开工基线 `22cc616`。

### 改动文件

- [PlanEditor.tsx](../src/features/plan-editor/PlanEditor.tsx)：兜底保存错误分类，通过一个 ref 保留最近保存失败的发布提示；保留原状态栏原因，避免被通用发布失败状态覆盖。发布的保存提示按手动路径处理；待填全沿用原说明 alert，只弹一次。冲突／锁定行状态原样保留。成功保存清除旧提示。
- [strings-editor.ts](../src/i18n/strings-editor.ts)：任务卡中文原文及对应英文。删除已无引用的 `publishIncompleteAlert`、`autosaveFailed`、`saveFailedRetry`，以及同时失去引用的 `publishPlanNotSaved`。
- [saveFailure.ts](../src/features/plan-editor/saveFailure.ts)：六类纯函数；API 技术信息只取状态、code、首条 issue path；path 截 80 字符，非 API 的 name + message 合计截 80。技术文本压为单行并脱敏；不序列化未知抛出对象、details、issue message 或请求体。识别常见浏览器 fetch TypeError／NetworkError；页面自身 TypeError 归 internal。
- [saveFailure.test.ts](../src/features/plan-editor/saveFailure.test.ts)：32 条分类、路径、截断、异常结构、脱敏测试。
- [saveFailure-ui.test.tsx](../src/features/plan-editor/saveFailure-ui.test.tsx)：13 条真实 PlanEditor UI 测试，覆盖六类发布提示、专门分支、待填全单弹窗、自动重试、最新原因和成功后不复现旧提示。
- 本日志。

`createSaveController`、保存请求、布尔契约、重试时序、失败后 re-arm 均未改；`reconcile.ts`、`reconcile.test.ts`、后端和登录流程未改，无新依赖。

### 先红后绿证据

命令：`npm test -- src/features/plan-editor/saveFailure-ui.test.tsx --reporter=verbose`。

修复前（10:59:59），两条测试均收到旧的「计划保存失败／请检查网络」弹窗：

```text
× shows rejected reason and validation path when publishing cannot save
× shows network reason when publishing cannot reach the server
Test Files  1 failed (1)
     Tests  2 failed (2)
```

接入分类和提示后（11:01:45，与分类单测一起运行）：

```text
✓ shows rejected reason and validation path when publishing cannot save
✓ shows network reason when publishing cannot reach the server
Test Files  2 passed (2)
     Tests  10 passed (10)
```

分类测试最初因 `./saveFailure` 尚不存在而 suite 失败（`Tests no tests`，不冒充断言失败）；实现后六类、首条 path、80 字符截断共 `8 passed`。

随后新增测试也抓到并修复了以下问题：

- `recognizes browser network failures` 的 DOMException 用例与 `redacts credentials and request content from messages: token "secret-value"`：`2 failed | 27 passed` → `29 passed`。
- `redacts response excerpts in JSON parsing errors`：普通引号摘录 `1 failed | 29 passed` → `30 passed`。
- 同名测试中的 `[excerpt`／`{excerpt` 两例（Spec 审查反馈）：`2 failed | 30 passed` → `32 passed`。修复为先脱敏引号摘录，再截断括号内容。

最终针对性结果（11:08:47）：

```text
✓ src/features/plan-editor/saveFailure.test.ts (32 tests)
✓ src/features/plan-editor/saveFailure-ui.test.tsx (13 tests)
Test Files  2 passed (2)
     Tests  45 passed (45)
```

### 最终检查

最终代码的 `npm test`（11:09:08）：

```text
Test Files  89 passed (89)
     Tests  863 passed (863)
```

- `npx tsc --noEmit`：exit 0，无诊断。
- `npm run lint`：`> tsc --noEmit`，exit 0；本仓 lint 脚本本身就是类型检查，没有独立 ESLint。
- `git diff --check`：exit 0。
- 测试过程有 Node `--localstorage-file` 无有效路径的 warning；没有测试失败。
- Standards 独立只读审查：0 项发现。Spec 独立只读审查：1 项脱敏顺序发现，已补先红后绿测试并复审关闭，当前 0 项未关闭。

### 401 刷新失败后的实际页面行为（读代码确认）

**保存请求 401 且 refresh 失败清 token 后，已挂载的编辑器留在原页面，session 发布提示可见。**

依据：

1. [client.ts](../src/api/client.ts#L111) 的 refresh 失败只调用 `clearTokens`；[clearTokens](../src/api/client.ts#L30) 只删除两项 token，不派发视图变更事件。`request` 随后对原 401 抛 ApiException。
2. [PlanWorkspace onSave](../src/features/workspace/PlanWorkspace.tsx#L934) 等待 reconcile 并让错误冒泡给 PlanEditor，没有 401 强制退出分支。
3. [App](../src/App.tsx#L16) 的 user/view 是初始化时读取的 React state，没有 token/storage 监听；只有显式 onLogout 等操作更新该 state，不会因 token 被清自动退回登录页。
4. 真正刷新／重新挂载 App 后，[currentUser](../src/api/auth.ts#L98) 因 access token 缺失返回 null，才进入登录页。本任务未修改这一登录流程。

### 踩到的坑、边界与偏离

- 原 handlePublish 会把 catch 写入的具体状态覆盖成通用发布失败；已删除该覆盖。
- 原发布入口可能沿用初始 auto 提示模式；此次通过 `!publishing.current` 仅区分提示模式，不改队列或计时器，并确保待填全说明只弹一次。
- Vitest 2 不支持 `toHaveBeenCalledExactlyOnceWith`，最早一次运行是 matcher 错误；先改成次数与参数两个断言，才记录上面的有效业务红测试。
- DOMException 在当前 jsdom 中不一定 instanceof Error；已显式识别。
- 引号与括号脱敏顺序会影响正文泄漏，已补回归。
- 文件范围：卡列出的五个代码／测试文件加要求的 JOURNAL，无范围外持久文件。额外删除 `publishPlanNotSaved` 是清理此次失去引用的死文案。
- 浏览器目检未完成：启动本地 Vite 被沙箱拒绝，原始错误为 `Error: listen EPERM: operation not permitted 127.0.0.1:5187`；改用同目录离线预览后，浏览器工具初始化及状态查询各超时一次，均返回 `js execution timed out; kernel reset, rerun your request`。未取得截图，不声称已完成目检；临时预览文件已删除。真实 PlanEditor 的 jsdom UI 回归通过。
- `docs/agents/issue-tracker.md` 不存在；按 code-review 技能建议，后续可运行 `/setup-matt-pocock-skills` 补齐。本次 spec 已由用户任务卡提供，只读双轴审查不依赖 tracker，未因此中断或私建配置。

## 2026-10-14 — Spec 010：计划编辑器显示学员自加记录

来源：`specs/010-student-added-actuals/SPEC.md`、`CARD.md`、`docs/SPEC-038.md`。本节为开发自测与自审证据，待 Opus 收货，不代表视觉验收或部署。

### 开工与范围

- 指定工作树 `/Users/david/Projects/apps/meetpr-plan-web-wt-010`，分支 `feat/010-student-added-actuals`，基线 `504e759`；开工 status 干净。第一个命令在当前目录用 `mktemp ./codex-write-check.XXXXXX` 创建并删除文件，exit 0，没有换工作树。
- 已按序读 CONTEXT、CLAUDE、010 SPEC/CARD、038，核对 worktree、最近 15 条提交和本日志。仓内无另行 AGENTS/FOLLOWUPS；沿用会话给定规约。
- 未安装依赖、未手工读取 `.env`、未向线上后端发请求；请求测试全部 mock。执行用户要求的 Vite 命令会运行仓内既有配置加载流程，未输出环境文件内容。未 commit/push/开 PR；SPEC、CONTEXT、计划行模型与计划写入模块未修改。
- 使用 tdd 与 code-review。测试入口沿用批准的 actuals 纯函数、DayColumn/PlanEditor 组件及 API 请求；`coach.test.ts` 复用仓内 fetch mock 模式。仓内无 `docs/agents/issue-tracker.md`，已提示后续可用 `/setup-matt-pocock-skills` 补齐；本卡以明确的 spec 为据，不依赖 tracker。

### 改动文件

- `src/api/coach.ts`、`src/api/types.ts`：`scope=all`；`StudentSetLog.plan_day_id?: string | null`。
- `src/features/plan-editor/actuals.ts`：按处方边界划分额外组；新增按日/动作归集自加动作，组序排序、最新记录覆盖。原 `groupActualsByExercise` 未改。
- `src/features/plan-editor/PlanEditor.tsx`：独立 Map 保存自加记录，只作为 DayColumn 的附加渲染数据；按服务器 day ID 定位、动作库解析名称，未知动作兜底 ID。有服务器训练日即能加载实际值，覆盖“仅自加动作有记录、所有处方行 hasLogs=false”的情况；无服务器日且无记录的草稿仍不请求。
- `src/features/plan-editor/components/DayColumn.tsx`：共用 ActualLine，处方标签之后加分隔字与中性标签；自加动作只读行位于计划动作之后，无编辑/选中/拖动/键盘单元格入口。组数边界取服务器 `opaqueSets.length`；旧无 provenance 行用已锁定的原有组数。mapping/reconcile 对服务器处方保留 opaqueSets，未引入本地可编辑组数的新来源。
- `src/i18n/strings-editor.ts`、`src/index.css`：zh/en 文案，沿用 CSS tokens 的中性灰标签、浅灰行、冻结名称格和列宽对齐。
- `src/api/coach.test.ts`（新）、`src/features/plan-editor/student-added-ui.test.tsx`（新）、`src/features/plan-editor/actuals.test.ts`、`src/features/plan-editor/actuals-ui.test.tsx`：新增回归。既有测试断言未删改。
- 本日志仅在末尾追加本节。

### 先红后绿

按行为纵向实施，每次先运行新增测试，再修改实现：

1. `splits by server prescription count and set_index, not log position`：`1 failed | 11 passed`，缺少 `splitActualSets`（运行时 not a function）；实现后 `12 passed`。
2. `groups only linked adhoc logs by day and exercise, sorting sets and taking the latest re-log`：`1 failed | 12 passed`，缺少归集函数；实现后 `13 passed`。包含相同日期不同日、不同动作、逆序、重复组序最新优先、undefined/null/空日 ID 及非 adhoc 排除。
3. `requests scope=all and accepts the legacy response without plan_day_id`：`1 failed`，实际 URL 为 `scope=plan`；改为 all 后 `1 passed`。
4. `keeps four prescribed chips unchanged and separates the fifth as neutral in both actual lines`：`1 failed`，第五个强度标签仍为 `tone-na` 且无分隔；实现后与旧 actuals-ui 一起 `4 passed`。
5. `appends a read-only student-added exercise after plan rows without changing prescription totals or selection`：红阶段未找到自加行；加入渲染后通过。测试编写中另修正了本次新测试的 DOM selector（实际属性为 `data-rowid`）与服务器组数测试 fixture（本地网格扩为 6 组，服务器仍 4 组）；这些测试搭建问题不作为业务红证据，未修改任何基线断言。
6. `loads student-added-only days, isolates same-date days by id, and keeps save/publish plan rows unchanged`：红阶段预期请求 1 次、实际 0 次；拓宽有服务器日的读取入口、按日接入附加数据后通过。

### 验收清单逐项映射

| SPEC 验收项 | 测试名与证据 |
| --- | --- |
| 1 无自加时保持原渲染 | 原 `renders per-set actuals under the target cells with 红/黄 tones and thresholds`、`renders no actual lines for a draft plan without logs` 保持断言并通过；新增 `renders no new elements for absent or empty student-added data`。另临时提取 HEAD 的 DayColumn，以 `matches the baseline DayColumn DOM byte for byte without student-added records` 比较 8 组 readOnly × 有无实际值 × 主/辅行的 HTML 字节，`1 passed`，比较源与测试已删除，输出 `/tmp/meetpr-010-baseline.log`。 |
| 2 处方 4 组、实际 5 组 | `keeps four prescribed chips unchanged and separates the fifth as neutral in both actual lines`：两行前 4 标签仍 tone-ok，第 5 标签 tone-added，分隔位置与值明确断言；纯函数 `splits by server prescription count and set_index, not log position` 覆盖稀疏组序与零处方。 |
| 3 额外组失败/未完成 | `preserves failure and missed styles for extra sets and uses server prescription despite a changed grid count`：强度/重量都保留 tone-off、tone-missed，服务器 4 组与本地 6 组情况下仍在 index=4 分界。 |
| 4 自加只读、不影响处方/写入 | `appends a read-only student-added exercise after plan rows without changing prescription totals or selection`：名称、下方标注、组次 –、两组强度与重量灰标签、位置、无输入/按钮/tabindex/draggable/编辑单元格、点击不触发选择与编辑、日与分区处方统计不变；`loads student-added-only days, isolates same-date days by id, and keeps save/publish plan rows unchanged`：点击发布，onSave/随后 onPublish 均执行，交给保存边界的 weeks 仅原处方，未混入自加动作。未向真实后端发送保存/发布。 |
| 5 按 day ID 隔离 | 上述 `loads student-added-only days…` 同日期的 day-1/day-2 各显示自己的动作；纯函数归集测试也覆盖同日期两个日 ID。 |
| 6 旧后端兼容 | `keeps old-backend rendering unchanged and shows catalog names in completed read-only plans`：无 plan_day_id 不出现标注或附加行，原实际标签存在；归集与 API 请求测试同时覆盖旧响应。不把无所属日的 adhoc 显示到任一天。 |
| 7 中英文 | `renders Added by athlete in both extra-set lines and the read-only exercise name in English`；中文由第 2–4 项断言覆盖。上项兼容测试还覆盖真实 ExerciseIndex 名称解析、completed 只读态；组件测试覆盖未知动作 ID 兜底。 |
| 8 三项自检 | 见下方最终检查。 |

### 逐条核对：上下文、组序与跳练

1. **ContextRail.tsx / DayHeaderContext**：`getExerciseStats(studentId, exerciseId)` 读取动作库 ID 的历史；`recent_sessions` 按日期归集，类型只有日期与各组，没有 plan_exercise_id、plan_day_id 或对应历史处方。`last.sets.map` 只显示实际记录和序号，不按计划动作处方列组；不能拿当前行组数推断历史额外组。SPEC §4 的条件性分隔要求在此不触发，未改。`by_set_count` 用当前组数查询历史 bucket，是既有历史对照口径，不索引实际组到处方。
2. **ContextRail.tsx / Sessions**：set_index 仅作 key 和显示，重量/次数/RPE 直接取同条实际记录；不索引处方，不会因额外组越界或串组。未改。
3. **StatsViews.tsx / SessionDetail**：set_index 仅作 key/显示，数据来自 recent_sessions；未用其访问处方数组。统计口径未改。
4. **VideosPage.tsx**：videoAssociation、标题、列表中的 set_index 只经 setLabel 显示；定位优先精确 set_log_id，旧记录才按日期+动作名+set_index 匹配。没有处方数组解引用，额外组没有上限截断或邻组回退。未改。
5. **跳练 / 游标与落后**：`mapping.ts: deriveStudentPlanCursor` 排序后找第一个 `completed_at == null`，不是最后完成日的后一天；因此先结算后日不会让前日被视为完成。lagDays 针对该未完成日的推荐日期计算。全部完成需要找不到任一未完成日；旧响应缺 completed_at 时隐藏游标。未改。
6. **跳练 / 锁定**：DayColumn 按本行 hasLogs 禁编辑，日拖动按本日行记录锁；dayMove、reconcile 同样逐日/逐行检查，未由后日状态推定前日完成。用户明确自加动作不进入这些计划编辑路径，本卡保持该边界。未改。
7. **跳练 / 后移**：PlanEditor 的影响列表、已完成日计数及尾日投影分别检查每个 day.completedAt；mapping 从该服务器日读取完成/推荐日期。无“前日已完成”的假设，未改。
8. **保存/快照/发布/复制周/后移/计数**：自加数据仅在独立 React state → DayColumn props 中流动，未写 weeks、ExerciseRow、tree、mirror。所有上述路径继续只读计划 weeks；组件已验证汇总不变和保存/发布回调内容，原 mirror、copy-week、shift、cursor、reconcile 回归由全量测试覆盖。

### 最终检查与限制

- 首轮 `npm test` 与 tsc/build 并行，`90 passed / 1 failed`、`884 passed / 1 failed`；唯一失败是未改动的 `pinyin.test.ts > matchesPinyin > stays bounded on adversarial state-accumulating input`，实际 1061.191917ms 超过 1000ms。未改该测试或代码；资源竞争是可能原因，未声称已确诊。
- 随后单独执行原命令 `npm test`：exit 0，`Test Files 91 passed (91)`、`Tests 885 passed (885)`、末行 `Duration 13.24s`。原始输出 `/tmp/meetpr-010-test-repeat.log`。
- `npx tsc --noEmit`：exit 0，无诊断（运行包装器最后输出 `tsc exit 0`）。
- `npm run build`：exit 0；Vite 仍有大于 500 kB 的 chunk 提示，不是构建失败。最终构建最后结果行见本节末的补充。
- `git diff --check`：exit 0。
- code-review 独立只读审查：Standards 0 项；Spec 0 项。审查基于 `git diff 504e759` 加新增测试文件，不把未提交变更遗漏在 three-dot diff 外。
- **浏览器目检未完成**：`npm run dev -- --host 127.0.0.1 --port 5187` 返回 `Error: listen EPERM: operation not permitted 127.0.0.1:5187`；浏览器工具 `cua.getState()` 20 秒后返回 `js execution timed out; kernel reset, rerun your request`。没有截图，不能声称已完成真实浏览器目检；已取得组件 DOM/交互与基线字节一致证据。
- 待产品裁决事项：无。SPEC/CARD 无冲突；没有修改现有断言的需要。剩余交接限制为上述浏览器目检，由后续具备浏览器环境的收货执行。

最终 CSS 列宽/中性灰调整后的 `npm run build` 最后结果行：`✓ built in 1.44s`（exit 0，含 tsc）。

### 返修第 1 轮（2026-10-14）

来源：Opus 收货意见 R1/R2。David 转述上一轮在 Opus 本机 885 条测试、tsc/build 与浏览器目检通过；该目检是上一轮实现的收货证据，不是本轮新截图。

**状态：两项均遇到“现有测试断言一条不许改”的硬约束冲突，停止实现，待明确允许更新下列具体断言。** 本轮仅追加本日志；代码、测试及上一轮 DOM 都未改，无新的 red/green 结果，不将现有测试全绿表述成返修完成。

- **R1 / 既有结构断言冲突**：`student-added-ui.test.tsx` 的 `keeps four prescribed chips unchanged and separates the fifth as neutral in both actual lines` 第 43–44 行要求 `line.children[5].textContent === '学员自加'`，且 `line.children[6]` 直接是首个额外组标签。另 `preserves failure and missed styles for extra sets and uses server prescription despite a changed grid count` 第 57 行要求 `line.children[2].textContent === '学员自加'`。把小字与首个标签包进同一个不可拆容器后，该直接子元素的 textContent 将包含小字和标签，三条既有断言都会失效。它们验证的是旧 DOM 层级，不是必须保留的处方配色；需要允许将这三条改为容器内语义定位，保留值/顺序/配色断言，再追加 `keeps the added label and first extra chip in one non-wrapping container in both actual lines` 回归。未通过隐藏副本或改 DOM 访问行为绕过断言。本轮未新增该测试、未修改 ActualLine/CSS；上一轮 8 组无额外记录 DOM 字节比较的源实现未改变，本轮未重跑临时比较。
- **R2 / 确实撞到 to=今天断言**：`actuals-ui.test.tsx` 的 `uses the browser-local calendar date as the actuals upper bound` 第 140 行明确断言 `getStudentSetLogs('student-1', '2026-08-22', '2026-08-22')`。fake clock 是浏览器本地 2026-08-22 00:30；正确的排他上界应为 2026-08-23。根据本轮明确指示“R2 若确实撞到……停下写进 JOURNAL……不要自行改”，在新增测试与修改实现前停止。拟新增的红测试名为 `includes today's logs by requesting tomorrow as the exclusive upper bound`，尚未写入/执行。
- **R2 原因与最小改法**：这是对既有行为的修正，不是扩大区间口径。按收货说明，后端条件为 `logged_date < to`，所以传 today 会排除当天普通组、额外组和自加动作。获准更新上述断言后，应只把 PlanEditor 这一处调用的上界改为 `isoDate(addDays(today, 1))`；两个函数已经从 `mapping.ts` 导入，使用本地日历日期加一天，保留 `from > today` 等其余条件。没有另写日期算法，也没有修改调用。
- **其他相同写法的调用方清单**：无。检索 `src` 内 `getStudentSetLogs` 与 `/students/.../sets`，生产业务调用仅 `PlanEditor.tsx:579`；`api/coach.ts:6–7` 是透传 from/to 的请求封装；`api/coach.test.ts` 使用固定日期验证透传，不计算 today，不属于同类调用。
- **边界**：未改/删除/纳入交付 `mock-student-added.html` 和 `src/mock/studentAddedCheck.tsx`；未操作 5197 dev server。未 commit/push/开 PR，未改 SPEC/CONTEXT，未装依赖、未手工读取 `.env`、未请求线上后端。三项自检按要求执行原命令，使用仓内既有配置；不查看或输出环境文件内容。

本轮自检（实现仍为返修前版本）：

- `npm test`：exit 0；`Test Files 91 passed (91)`、`Tests 885 passed (885)`；最后结果行 `Duration 6.48s`。输出 `/tmp/meetpr-010-r1-test.log`。
- `npx tsc --noEmit`：exit 0，无输出/诊断。
- `npm run build`：exit 0；最后结果行 `✓ built in 1.35s`。保留既有大于 500 kB chunk 提示。输出 `/tmp/meetpr-010-r1-build.log`。
- `git diff --check`：exit 0。

待放行的具体范围：R1 三条直接子元素断言调整为新容器内的等价内容断言，R2 一条日期断言由 2026-08-22 改为 2026-08-23；其余既有断言保持原样。未获得该放行前，不继续两项实现。

**放行后续做结果（2026-10-14）：R1/R2 已实现，自检通过；上面的暂停状态已解除。** Opus 经 David 明确放行下列四条断言，并说明本卡新增测试可因返修直接调整、在日志记录；此后不再为本卡新增测试重复请求放行。

本次续做改动文件（相对于上次暂停时的工作区）：

- `src/features/plan-editor/components/DayColumn.tsx`：仅调整 ActualLine 的额外组部分。将「学员自加」与第一个额外组标签放在 `.actual-added-first` 中，内联 `display: inline-flex; flex: none; flex-wrap: nowrap; white-space: nowrap`，沿用 3px 间距和居中对齐；强度与重量共用。后续额外组仍是外层可折行项目。无额外组不产生该容器，自加动作本身的标签排列保持原样；没有修改处方组渲染或新增 CSS 文件改动。
- `src/features/plan-editor/PlanEditor.tsx`：仅将该处请求上界从 `today` 改为 `isoDate(addDays(today, 1))`，复用已有导入，`from > today` 等条件不变。修复既有的排他上界排除今日记录问题。其他同样写法的业务调用方仍为无。
- `src/features/plan-editor/student-added-ui.test.tsx`：按授权改三条结构断言，追加不可拆容器回归。
- `src/features/plan-editor/actuals-ui.test.tsx`：按授权改一条日期断言，追加今日记录回归。
- `docs/CODEX-JOURNAL.md`：本小节续写。

四条获准断言的具体修改：

1. `keeps four prescribed chips unchanged and separates the fifth as neutral in both actual lines` 原第 43 行：从 `line.children[5]` 改为新容器内 `.actual-tag`，仍断言小字为「学员自加」。
2. 同测试原第 44 行：从 `line.children[6]` 改为新容器内 `.actual-chip`，仍断言重量 `180×3` / 强度 `@5`；新增首标签 tone-added 断言。原五个标签的顺序/配色数组完整保留。
3. `preserves failure and missed styles for extra sets and uses server prescription despite a changed grid count` 原第 57 行：从 `line.children[2]` 改为新容器内 `.actual-tag`；新增首额外标签 tone-off 断言，原 prescribed/off/missed 配色数组保持原样。
4. `uses the browser-local calendar date as the actuals upper bound` 原第 140 行：仅把最后一个期望日期 `2026-08-22` 改为 `2026-08-23`。原假时钟与 `toISOString` 模拟逐字保留，继续区分本地日历与 UTC。除获准此行外，改动前已存在的断言均未改。

先红后绿与对应测试：

- **R1**：新增 `keeps the added label and first extra chip in one non-wrapping container in both actual lines`，先确认容器不存在导致失败；更新后的两个旧结构测试也因容器缺失失败，结果 `3 failed | 3 passed (6)`。实现后 `6 passed (6)`。新测试验证强度/重量两行均为同容器、正好小字+首标签两个子元素、首标签文字/tone、计算样式 inline-flex/nowrap/white-space/flex-shrink=0，以及下个额外标签仍是容器外的相邻项目。红阶段输出 `/tmp/meetpr-010-r1-red.log`。
- **R2**：先新增 `includes today's logs by requesting tomorrow as the exclusive upper bound` 并更新获准日期期望，执行得到 `2 failed | 4 passed (6)`：收到的上界仍为 `2026-08-22`，期望为 `2026-08-23`。随后才修改调用上界。新测试的 API mock 按 `from <= logged_date < to` 真实过滤，验证当天普通组、额外组和所属日的自加动作均在 DOM 出现。与 R1 合跑后 `2 passed` 文件、`12 passed` 测试。红阶段输出 `/tmp/meetpr-010-r2-red.log`。
- **无额外组字节兼容**：重跑上一轮 `matches the baseline DayColumn DOM byte for byte without student-added records`，将 HEAD 原始 DayColumn 与当前实现对比，8 组 readOnly × 有无实际值 × 主/辅行 HTML 字节全部一致（`1 passed`）。临时比较源码与测试已删除；没有接触 Opus 的两个临时文件。输出 `/tmp/meetpr-010-r1-baseline.log`。SSR 的 useLayoutEffect 提示不影响该字节比较；不将此测试称为浏览器目检。

最终自检：

- `npm test`：exit 0；`Test Files 91 passed (91)`、`Tests 887 passed (887)`；最后结果行 `Duration 8.06s`。输出 `/tmp/meetpr-010-approved-final-test.log`。
- `npx tsc --noEmit`：exit 0，无输出/诊断。
- `npm run build`：exit 0；最后结果行 `✓ built in 1.26s`，仍有既有大于 500 kB chunk 提示。输出 `/tmp/meetpr-010-approved-final-build.log`。
- `git diff --check`：exit 0。
- 独立增量复审：Standards 0 项、Spec 0 项，比较本轮启动时保存的四个代码/测试文件与当前文件。
- Opus 两个临时文件校验值在续做前后完全一致，未改、未删、未列入本轮交付；5197 服务未操作。未 commit/push/开 PR，未动 SPEC/CONTEXT、未装依赖、未手工读取 `.env`、未请求线上后端。
- 本轮未重新浏览器目检；交付证据为 DOM/计算样式、交互/请求回归与全量自检。无剩余待裁决事项，交回 Opus 收货。

## 2026-10-17 · Spec 093 卡 W0：邮箱登录与管理台邮箱查询

- **任务与基线**：按 David 批准的交接 CARDS.md 的 W0 / SPEC.md §11 实施，口径以 SPEC.md 为准。独立 worktree `meetpr-plan-web-wt-093-w0`，分支 `feat/093-email-login-admin`，base `e6e9a14`（origin/main）。只改 W0；W 的申请、设密码、入驻、落地页和审批页面尚未开始，仍须等待 B 国内 staging 部署。
- **改动**：登录字段中英文统一显示「邮箱 / Email」，初始 inputMode 为 email、移除 +86 视觉前缀；仍保留 text 输入与既有按 `@` 分流，手机号照旧规范化走手机号接口。管理台用户列表新增邮箱列，邮箱/手机号缺失显示 `—`，搜索保留姓名、手机号并增加不区分大小写的邮箱匹配；角色筛选和明细导航保留。沿用既有列表样式，横向容器增加一列，无新设计或导航。
- **接口契约**：`AdminUser.email: string | null`，`phone: string | null`；后端卡 B 负责给 `GET /admin/users`、`GET /admin/users/:id` 补 email 字段。当前管理台在客户端过滤全量用户，不要求新增后端搜索参数。旧后端未返回 email 时前端仍显示 `—`，但无法查到邮箱，须部署后联调。
- **公开测试 seam / 红绿证据**：沿用 LoginScreen / AdminWorkspace 组件用户交互，以及既有登录 API 路由回归。先更新邮箱初始展示的测试，红阶段 1 failed / 20 passed（旧标签），再实现后 21 passed；再新增邮箱列、无手机号账号、大小写/首尾空白邮箱搜索、旧手机号、姓名和角色过滤交互，红阶段 1 failed / 3 passed（邮箱未显示），实现后 4 passed。原手机号和邮箱登录成功/失败回归保留。原先精确拼接整行文字的导航定位改为按教练姓名匹配，以容纳新增邮箱列。
- **UI 目检**：使用 cua 的 Codex IAB（后台模式）操作真实组件，通过本地临时 mock 页面注入合成账号；mock 拦截全部 fetch，不连接真实后端，无真实账号、凭证或个人邮箱进入截图。亲看初始邮箱登录框、两行账号的邮箱列/空值、输入大写邮箱后仅剩匹配教练。截图见 [登录](evidence/spec093-2026-10-17/w0-login-synthetic.png)、[用户列表](evidence/spec093-2026-10-17/w0-admin-users-synthetic.png)、[邮箱搜索](evidence/spec093-2026-10-17/w0-admin-email-search-synthetic.png)，图内均标明本地合成数据。临时 harness 在 git 忽略目录 `.w0-qa.local/`，不纳入交付；复核服务保留 5198，页面 `http://127.0.0.1:5198/.w0-qa.local/index.html`，加 `?admin` 后点「用户管理」。
- **已验证**：`npm run lint`（即 `tsc --noEmit`）exit 0；`npm run build` exit 0，保留既有大于 500 kB chunk 提示；`git diff --check` 通过。只安装 lockfile 依赖，未变更 package.json/lockfile。
- **默认全量测试异常**：两次 `npm test` 均为 90/91 文件、887/888 用例通过，唯一失败是未改动的 `pinyin.test.ts` 的 1000ms wall-clock 性能断言；首次用时约 1924ms。当时同机运行 Android Gradle、其他 Vitest 与构建任务，进程快照显示 Java 208%/71% CPU。只降低 worker 并发复验，不修改此测试、阈值或 pinyin 实现；日志 `/tmp/spec093-w0-test.log`、`/tmp/spec093-w0-test-repeat.log`。
- **未验到 / 交付边界**：未用此改版网页登录真实国内 staging、未联调上线后的 admin email 字段；本地 mock 不替代真实认证/权限或部署验收。未部署、未 commit/push、未开 PR/合并；用户要求 PR 由 David 合并。W 页面仍未开始，独立 Standards/Spec 审查由主代理安排；本记录是实现与自测事实，不代表 Opus 收货终审。

### 主代理复核与交付补充

- 全量性能诊断：默认 worker 并发复验仍只有旧拼音性能门槛失败；将同一测试单独执行为 7/7、282ms。固定单 worker 执行 `npm test -- --maxWorkers=1 --minWorkers=1`，91 文件 / 888 用例全通过，57.96s，其中拼音性能用例 402ms。实现、性能测试和 1000ms 阈值均未修改。结果支持本机并发负载影响墙钟断言；不声称默认并发已修复。最终日志为 `/tmp/spec093-w0-serial-test.log`，默认复验为 `/tmp/spec093-w0-final-test.log`。
- 独立只读审查一轮：Standards 0 finding；Spec 0 finding。两个 reviewer 使用独立上下文，受并发槽位限制先后执行，未交换对方结论。主代理亲读全部最终 diff、亲看登录和用户列表截图；没有代码返修。
- 本卡代码、自测与截图可交付，真实 staging 联调及部署仍未完成。PR 交 David 合并；不以本地通过替代最终验收。

### 继续执行补验（2026-10-17）

Android 本机构建、并行后端测试与临时服务结束后，以原默认配置重新执行 `npm test`，exit 0：91 files / 888 tests，7.25s。原始输出见 `docs/evidence/spec093-2026-10-17/w0-default-tests-idle.txt`。未修改 pinyin 实现、测试或 1000ms 门槛；这次默认全量通过，保留前述并发高负载下的失败事实，不宣称墙钟测试永不波动。5198 临时 UI 服务已停止，合成 harness 仍留在忽略目录。代码已在 PR #109，仍未合并或部署；国内真实登录/admin 邮箱联调继续等待 B 部署。


## 2026-10-17 · Spec093 W0 追加网页找回密码（开发证据）

来源为 RN `claude/blissful-curie-wk8cxa@692228d` 的 CARDS W0 与 SPEC §11。按最新一次性执行顺序先写代码，再统一审批部署；此节覆盖此前“W 等 B 部署后开工”的旧执行记录，不改历史事实。

改动：登录页新增“忘记密码？”；填邮箱→公开 forgot 请求→6 位验证码、新密码、确认密码→公开 reset 请求→带成功提示回登录页。手机号显示“请填写注册时用的邮箱”；密码至少 8 个 Unicode 字符、最多 72 UTF-8 字节；确认密码仅本地验证、不发后端。错码/过期、限速、离线均可恢复；重发回到邮箱输入，清除旧码与密码；请求期间锁表单且防重复提交，不自动重试发码。邮箱规则从原 LoginScreen 原样提取，原导出保留；邮箱/手机号登录兼容不变。沿用既有视觉 tokens 与安卓中文/英文文案，无新产品设计。

TDD seam 是真实 LoginScreen 用户交互到 fetch 网络边界：发码入口缺失、reset 表单缺失、非法输入未拦、错码/限速文案分别先红后绿（red1–4/green1–4 日志）。第一次红测试因 Node localStorage 夹具缺失而失败，修正为仓内同款 Map storage 后重跑取得真实缺功能红证据；未将夹具错误算有效红阶段。最后追加请求中重复提交/断网恢复回归首次即绿，明确不是先红。10 个新增组件用例通过；原登录 21 和 email-login wire 2 用例保持通过。

`npm test` 92 文件/897 测试通过（最后 1 条纯测试追加前）；追加后该 suite 10/10 通过。`npm run lint` 类型检查、`npm run build` 通过；build 保留既有大 chunk 提示。Impeccable detector 输出 `[]`。

浏览器：仅 localhost:5193 + 合成 HTTP fixture:3095，无真实发信/账号/密码修改。亲看桌面四状态和 390×844 手机布局，无横向溢出；浏览器 warn/error 为零。截图在 `docs/evidence/spec093-2026-10-17/`：`w0-forgot-email.jpg`、`w0-forgot-sent.jpg`、`w0-forgot-wrong-code.jpg`、`w0-forgot-success.jpg`，额外 `w0-forgot-mobile.jpg`。普通截图确认了两张 fullPage 抓图的瞬态裁切问题后重拍，没有通过改截图掩盖UI。可复现本地服务为同目录 `w0-recovery-fixture.cjs`，它不发送邮件、不存储密码。

未验：真实邮件、staging新密码登录及部署。最新 CARDS 指定双端真实找回、QQ/163 邮件分箱、beta24 已登录升级由 David 手测，统一验收文档为它们留空行。本节不把本地模拟响应算作 staging 验收。

独立增量审查：Standards 0 finding；Spec 0 finding。两位只读 reviewer 使用独立上下文，因并行实装占用槽位而先后运行，并非同一人自审；分别复跑登录/找回 31 tests 通过。主代理亲读全部源码、测试及四张截图。无代码返修。缺仓内 tracker 的流程未启用，本次依已提供卡片做 review-loop。

## 2026-10-17 · Spec 093 W：教练入驻和学员落地页（开发自测）

- 基线：W0 `622a7c0`，另已包含 W0 找回密码增量 `ca6d538`/`8e62694` 的等价 cherry-pick。W 增量在独立 `feat/093-coach-onboarding` 工作树，提交/PR 由主代理处理；不合并、不部署、不分发 App 包。
- 改动：公开申请/回执、fragment 设密码并邮箱登录、认证后的三段入驻指南、公开邀请页；iPhone/Android/desktop/微信 UA 分流；本地生成安装与邀请二维码、下载 SVG；完整邀请消息与 RN 文案一致；安装地址用 `VITE_CN_TESTFLIGHT_URL`/`VITE_CN_ANDROID_URL` 配置，缺值显示未开放。管理台新增审批/拒绝确认、邮件失败重发和学员邮箱冲突说明；工作台账号菜单可重新进入指南。新增五个 `platform=web` 漏斗事件，不采集自由文本或邮箱。
- 自测 seam：通过公开 React 页面和 HTTP fetch 边界验证申请重复/邮件失败、设密码 token/登录/过期重发/密码约束、当前永久码和完整消息、审批确认/学生邮箱冲突、四类设备/失效码/断网、HTTP 剪贴板 fallback 与配置安全。逐个行为先红后绿，六份 red 日志见 evidence；新增 17 条。现有 CoachShell 键盘循环测试随第三个菜单项更新。
- `npm test`：合并 W0 后 **93 文件、915 tests 全通过**，15.15s。中途并发构建时已有 `pinyin.test.ts` 的 1000ms 性能阈值一次失败；未放宽阈值，最终默认命令重跑通过。`npm run lint`、`npm run build` 通过；build 保留既有大 chunk 提示。Impeccable mechanical detector `[]`。
- 浏览器：仅 `127.0.0.1:3063` 合成 API 与 `127.0.0.1:5194` Vite。已亲看申请/回执、设密码、欢迎页和复制消息、管理台确认/通过、桌面双二维码、390×844 iPhone/Android/微信 UA 仿真与失效页。截图 `docs/evidence/spec093-2026-10-17/w-*.jpg`，合成复现 API 与 HTML 在同目录 `w-fixture*`；这些文件不属于生产页面。初次截图发现管理台黑背景下文字沿用浅色页颜色，已修为管理台现有 tokens 并复拍。
- 未验：国内真实 staging 迁移与换装、真实教练申请/欢迎信/审批/绑定全链路、真实安装地址与扫码落到实际包、真实微信与手机浏览器、无经验用户计时录屏、现存老账号数据。当前无真实安装 URL，部署需统一审批清单补齐；浏览器截图只证明本地布局和分流，不冒充真机/真实微信或生产验收。未发任何真实邮件、未接触国内数据库。

### W · Spec 审查定向修复：设密码后的登录恢复

- 修复 P2：浏览器已有教练/管理员 A 的会话，给 B 设密码成功，但 B 自动登录失败时，旧「继续登录」链接可能打开 A 的欢迎页。现在留在设密码页，显示固定目标邮箱，并要求重新输入该账号的新密码；恢复只调用邮箱登录，成功后才去欢迎页，不复用 A 的登录态，不重放已经消费的 reset token。
- 先红后绿：新增 coach/admin 两种旧会话下的完整恢复回归，断言 reset 只发生一次、两次登录都发给 B、成功后当前用户为 B。`npx vitest run src/features/onboarding/onboarding.test.tsx src/features/auth/LoginScreen.test.tsx src/features/auth/ForgotPasswordScreen.test.tsx` **3 文件 / 50 tests 通过**（onboarding 19 条）；`npm run lint` 通过。日志 `spec093-w-{red,green}-session-recovery.log`。
- 此轮浏览器截图尚未补：先前 IAB 会话结束后服务返回 browser unavailable；UI 使用既有页面表单样式，主代理继续截图复核。未操作真实账号或后端。
- Standards 定向一致性修复：管理台错误文字改用该作用域已有 `--brand-red`，避免借用全局 App 色板 token。未增加常量镜像测试。注：原 `--danger` 实际定义在已导入的 `docs/design/coach-web/tokens/colors.css`，因此不是未定义变量；此次更改是遵循管理台现有颜色口径。浏览器复核由主代理补齐（本子会话 IAB unavailable）。
- 修复后 `npm run lint`、`npm run build` 再次通过，见 `spec093-w-review-final.log`。登录第一次返回合成 503、第二次成功的复现 API 已保存为 `w-recovery-fixture.mjs`；只监听 localhost，无数据库、无真实邮件或账号写入。

最终独立审查：Standards 0 finding；Spec 首轮 1 项 P2（设密成功、自动登录失败时可能复用旧账号），按目标邮箱重新认证修复后定向复审 0 finding。新增 coach/admin 两种旧会话回归，onboarding 19/19；与登录/菜单相关测试合计 50/50。Standards 曾将导入的 --danger 误判未定义，已核实并撤回；管理台现统一使用现有 --brand-red。主代理亲读全部最终源码、测试、lockfile，亲看 14 张 W 截图；浏览器验证登录失败后继续登录成功，截图 w-set-password-login-retry.jpg。全量 915 tests 为两条恢复回归加入前；最终增量经定向验证，未把计数混作一次全量运行。

## 2026-10-17 · Spec 093 合并前文案对齐

David 直驱：学员邀请落地页第三步改为「粘贴邀请码」，与 App 中文按钮一致。仅改该处中文文案，未改邀请消息模板或英文。390×844 Chrome 合成 API 截图已亲看；截图与原始测试日志在本机 `/Users/david/Projects/scratch/spec093-closeout-20261017/`。全量 93 文件 / 917 tests、lint、带批准安装链接和空 VITE_API_BASE 的 build 通过。默认并发下既有拼音耗时断言为 2127ms（阈值 1000ms）；单 worker 全量通过，未改实现或阈值。独立 review-loop：Standards 0、Spec 0。未合并、未部署、未外发链接。

## 2026-10-17 · iPhone TestFlight 安装引导

David 现场要求给苹果用户增加 App Store 下载 TestFlight 的步骤。共用 InstallOptions 增加两步引导：先打开 Apple 官方 App Store 页面下载 TestFlight，安装后回本页打开测试邀请；已有 TestFlight 可直接第二步。教练欢迎页与学员邀请页共用，学员第二步仍执行复制邀请码。Android、桌面二维码、微信内打开提示沿用现有路径。

回归测试先红（缺 App Store 链接）后绿，onboarding 20/20；TypeScript 与生产构建通过。390×844 iPhone UA 合成邀请页已亲看，无横向溢出；截图 `/Users/david/Projects/scratch/spec093-closeout-20261017/iphone-testflight-guide.png`。未验证真机跨 App 跳转，未部署本次补丁或外发链接。

独立 review-loop 一轮：Standards 0 findings，Spec 0 findings。最终登录、找回密码、入驻回归合计 3 文件 / 51 tests 通过。

## 2026-10-18 · Coach web login entry correction

David 现场要求欢迎页工作台入口直接到网页登录并说明如何登录。欢迎 CTA 改为 `/coach/login`；该入口先展示已有 LoginScreen，说明使用申请邮箱和已设密码，隐藏离线示例入口。缓存会话不跳过此入口；成功登录后回 `/` 与原角色工作台。默认根路径和工作台空态未改。

回归先红后绿：欢迎页→登录页（缓存教练会话仍显示登录）；补充 coach/admin 登录后路径与工作台断言。最终 93 文件 / 921 tests 通过（单 worker），生产构建通过；构建保留空 API base 与批准的 CN 安装链接。浏览器亲看登录页，截图在本机 `scratch/coach-login-mail-20261018/coach-login.png`。独立 Standards / Spec 均 0 findings。此记录是工程验证，非整轮产品验收。


## 2026-10-19 · 011 卡 A：block 网格开发与自测（尚未收货）

工作树 `/Users/david/Projects/apps/meetpr-plan-web-wt-011`，分支 `feat/011-block-editor`，基线 `dd5a2dd`。启动临时文件试写、删除成功；已完整读取 CONTEXT、CLAUDE、CARD-A 与 SPEC（含屏幕稿）。本轮未 commit、push、开 PR，未改锁文件、数据模型、快照、API 请求体或 reconcile；未做 CARD-B 的历史栏、顶栏、计划菜单或新建对话框。离线预览临时文件已删除。

### 实现与文件清单

主区改为周行 × Dx 列；速记与原位单格编辑、逐行备注、填充柄预览与确认、框选积木和多天、键盘复制粘贴/删除/撤销、列星期和本周单格日期接线。复用原 DayColumn 的输入、锁定、实际值、自加动作、拖拽排序与后移；原顶栏和上下文内容保持。移除周期条、周 tabs/翻页、选中条、公式栏与加周入口。新版网格覆盖旧固定行高、裁切与冻结列样式。

新增文件（相对仓根）：

- `src/features/plan-editor/blockGridModel.ts`
- `src/features/plan-editor/components/BlockGrid.tsx`
- `src/features/plan-editor/components/block-grid.css`
- `src/features/plan-editor/blockGridModel.test.ts`
- `src/features/plan-editor/block-grid-ui.test.tsx`
- `src/features/plan-editor/blockGridTestUtils.ts`

修改实现及记录：

- `src/features/plan-editor/PlanEditor.tsx`
- `src/features/plan-editor/components/DayColumn.tsx`
- `src/i18n/strings-editor.ts`
- `docs/CODEX-JOURNAL.md`

迁移到新入口/手势的既有组件测试（以下均位于 `src/features/plan-editor/`）：

- `actuals-ui.test.tsx`
- `cell-selection-ui.test.tsx`
- `context-rail-ui.test.tsx`
- `copy-last-week.test.tsx`
- `dayMove-ui.test.tsx`
- `draftMirror-ui.test.tsx`
- `exercise-picker-ui.test.tsx`
- `leave-guard.test.tsx`
- `locked-ui.test.tsx`
- `multiday-selection-ui.test.tsx`
- `multirow-selection-ui.test.tsx`
- `pct-anchor-ui.test.tsx`
- `plan-shift-ui.test.tsx`
- `updateRetry.test.tsx`
- `week-band-ui.test.tsx`
- `week-capacity-ui.test.tsx`

旧控件专属用例随页面替换而迁移/合并，不把测试总数下降说成新增测试；受保护的 `selectionModel.test.ts`、`clipboard.test.ts`、`dayMove.test.ts`、`reconcile.test.ts` 原样保留，最终分别 7、8、9、70 条通过（合计 94）。

### 先红后绿与最终命令

| 命令 | 实际红阶段 → 绿阶段 |
| --- | --- |
| `npx vitest run src/features/plan-editor/blockGridModel.test.ts` | Dx 投影：1 failed → 1 passed；复制/粘贴/改日期增量：3 failed / 1 passed → 4 passed；服务端日身份保持在原日历坐标：1 failed / 4 passed → 5 passed |
| `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx` | 初始 4×4/编辑交互：1 failed → 1 passed；清空后空位与显式列星期：2 failed / 9 passed → 11 passed；覆盖区框选：1 failed / 11 passed → 12 passed；空 Dx 展开与英文控件：2 failed / 12 passed → 14 passed |
| `npm test` | exit 0，95 files / 904 tests，9.65s |
| `npx tsc --noEmit` | exit 0，无诊断 |
| `npm run build` | exit 0，Vite 2.71s；保留既有 >500 kB chunk 提示 |
| `git diff --check` | exit 0 |

红绿原始输出：`/tmp/card-a-shape-{red,green}.log`、`/tmp/card-a-marquee-{red,green}.log`、`/tmp/card-a-empty-{red,green}.log`；最终三命令分别 `/tmp/card-a-final-test.log`、`/tmp/card-a-final-tsc.log`、`/tmp/card-a-final-build.log`。初始模型红绿和身份回归已在工具输出中实跑；首次组件测试的 `localStorage.clear is not a function` 是测试夹具问题，移除无关 clear 后才取得业务断言红，不计为功能红证据，也没有修改测试基础设施。

六种存量夹具为 12 周导入、已发布带打卡、学员自加、后移、练数不一、星期不规律：逐格打开核对动作名、组数、次数、重量、备注和日期，并检查打卡实际值/自加记录；输入树不变，模拟时间推进后没有保存请求。另有拖填确认和一步撤销、框选分节追加和一步撤销、中英文控件等组件回归。jsdom 只证明 DOM/交互，不证明浏览器布局。

独立只读审查按 Standards / Spec 两轴执行两轮。Standards 指出的日期搬移不能携带 serverDayId 已修，并补 1 红 → 5 绿。Spec 指出的会话空位丢失、显式星期被已打卡多数覆盖、编辑覆盖区框选误选隐藏天已修；固定 58px/overflow:hidden 已局部覆盖。两轮后另补空格展开和英文下拉回归。审查未将以下约束缺口判为通过。

### 与 SPEC 不一致、待裁决与未验证

1. **单格日期不是完整的任意例外日期能力**：当前只允许本周 7 天内的空日历位置；目标已有训练/服务端日或跨周时不改。列星期修改也跳过已占用目标，可能只改部分周。SPEC 未明确这些限制；不能据此宣布 §5 全部完成。
2. **后移日恢复原日期的缺口**：当目标仍是原 calendar offset，处方没有变更，现有 reconcile 的 canonical 相等分支不产生写入，后续 schedule 同步会恢复服务端后移日期。现有接口只支持整批后移/撤销最近整批，没有单日取消。遵守“不改 reconcile/请求体/模型”约束，未用伪造处方变化或删建来绕过。该项需 Opus/David 确认接口与范围，未完成。
3. **Dx 星期规则与全空骨架只在本页会话保留**：未增加持久化字段。重新打开仍按存量日期众数推导；若多数周已打卡，显式列头星期可能回到旧值；全部训练日清空并重开后可能只剩 D1。CARD-B 新建骨架尚未接入，未擅自新增加 Dx 控件。持久化口径需与不改数据模型的约束对齐。
4. **浏览器验收缺失**：没有亲验 1440×900 的 4×4 一屏与 8 动作展开、不裁切、历史栏展开后尺寸，不能把 CSS/DOM 断言充当该验收。`npm run dev -- --host 127.0.0.1` 被沙箱禁止监听；离线 file: 预览又被浏览器自动安全审查拒绝（仅允许 http:/https:），停止该路径，没有换 surface/协议绕过。待 Opus 按 SPEC 浏览器亲验。

监听原始报错（`/tmp/card-a-vite.log`）：

```text
error when starting dev server:
Error: listen EPERM: operation not permitted 127.0.0.1:5180
    at Server.setupListenHandle [as _listen2] (node:net:1986:21)
    at listenInCluster (node:net:2065:12)
    at node:net:2274:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
```

所有 Vitest 测试均无需监听端口并成功运行，没有沙箱权限导致的测试失败。以上为开发和自测证据，卡 A 仍有列出的 SPEC 缺口及浏览器门禁，不作功能通过或可合并结论。


## 2026-10-19 · 011 卡 A 第 1 轮收货返修

本轮按 David 的 6 项定向返修要求执行，工作树仍为 `/Users/david/Projects/apps/meetpr-plan-web-wt-011`，HEAD 已核实为 `4022344`；试写并删除临时文件成功。重读 SPEC §2、§4、§5、§6 新增条目。未 commit/push/开 PR，未改锁文件、reconcile、数据模型或 4 个受保护测试，未做 CARD-B。

本条覆盖上一节已经裁决的待决定项：单格日期仅本周空位、后移日不单独恢复已写入 SPEC；星期规律持久化和改周数交卡 B，本轮不再作为卡 A 待决项。David 转述 Claude 在沙箱外完成上一版 1440×900 亲验：4×4 一屏可见、W1D2 拖到 W4 确认覆盖后复制成功；这是收货方证据，不冒充本轮 Codex 浏览器验证。

本轮改动文件（相对仓根，共 13 个；其他未提交文件沿用上一轮）：

- `src/features/plan-editor/PlanEditor.tsx`：去掉编辑卡 headerContext 接线；恢复原 `fillSelectedIntensityDown` 与 Cmd/Ctrl+D；删除 formulaCellDraft、curWeekLabel、hasRowClipboard 空壳及死回调；日期操作共用界面星期映射。
- `src/features/plan-editor/components/DayColumn.tsx`：日期默认显示文字，点击才挂载日期选择浮层；移除 block 编辑卡上下文；处方方式与值置于同一行容器，实际值仍保留。
- `src/features/plan-editor/components/block-grid.css`：普通处方行约 40px、强度/重量控件同排；多组输入在格内横向滚动，实际值仍按内容撑高；日期选择浮层定位。
- `src/features/plan-editor/components/BlockGrid.tsx`：星期标签改用已有 `DOW_LABELS`，删除锚定日期硬编码。
- `src/features/plan-editor/blockGridModel.ts`：先占匹配星期列，再将不匹配的存量日期依序补空位；两种日期操作接收同一套 weekday 投影。
- `src/features/plan-editor/blockGridModel.test.ts`：W4 缺周三时 D2 留空、周五仍在 D3，填充周三不覆盖周五；旧不规律夹具期望按新条目更新。
- `src/features/plan-editor/block-grid-ui.test.tsx`：日期点击展开/选择后关闭、头部无画像、处方控件同排；连续改列后再改单格/改列不串到另一训练日。
- `src/features/plan-editor/cell-selection-ui.test.tsx`：恢复逐组强度/重量 Cmd+D 与只读保护断言。
- `src/features/plan-editor/context-rail-ui.test.tsx`：保留旧上下文组件的直接渲染回归，移除它必须挂在编辑卡里的旧集成假设；新编辑卡无上下文由 block-grid-ui 验证。
- `src/features/plan-editor/dayMove-ui.test.tsx`：改单格日期先点日期文字，再操作出现的日期输入。
- `src/features/plan-editor/week-band-ui.test.tsx`：卡头操作断言区分日期文字按钮与右侧 Esc 收起。
- `src/features/plan-editor/block-date-save.test.ts`（新增）：真实 reconcile + API 边界保存证明，未改 reconcile 本身。
- `docs/CODEX-JOURNAL.md`：本条开发证据。

红 → 绿（均实际运行）：

| 命令 | 失败数与通过数 |
| --- | --- |
| `npx vitest run src/features/plan-editor/blockGridModel.test.ts` | 缺周三落列：1 failed / 5 passed → 6 passed |
| `npx vitest run src/features/plan-editor/cell-selection-ui.test.tsx` | 逐组 Cmd+D：2 failed / 6 passed → 8 passed |
| `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx` | 紧凑头部：1 failed / 14 passed；同排样式：1 failed / 15 passed；实现后该 suite 16 passed；连续改列寻址增量：2 failed / 16 passed → 18 passed |
| `npx vitest run src/features/plan-editor/block-date-save.test.ts` | 2 passed；这是已有保存路径的补证，首次即绿，不伪称先红 |

日志在 `/tmp/card-a-r1-weekday-{red,green}.log`、`/tmp/card-a-r1-cmdd-{red,green}.log`、`/tmp/card-a-r1-header-red.log`、`/tmp/card-a-r1-density-red.log`、`/tmp/card-a-r1-targeted.log`（5 files / 37 tests，包含当时 16 条 block-grid UI）、`/tmp/card-a-r1-projection-{red,green}.log`（最终相关 3 files / 25 tests）、`/tmp/card-a-r1-save.log`。过程中一次 JSX 包装闭合错误，以及 CSS raw import 被 Vitest stub/DOM URL 与 Node fs 不兼容的夹具错误，均已修正，不计为有效业务红证据；样式用例改为读取实际 CSS 后重新验证旧样式失败、修复样式通过。未修改测试基础设施或为沙箱改变测试行为。

保存安全证据：以 published 服务端树和有 serverRowId 的 2 行同动作不同处方起步，分别通过 `changeBlockDate` / `changeBlockWeekday` 移到本周空日，再调用真实 `reconcilePlan`。断言只发 1 个 batch 请求，delete_day_ids 精确含旧日，upsert_days 仅含新坐标且保留两份组次/重量/备注；未移动的另一日原样保留；模拟服务端按现有 batch 契约处理后总计 3 行、ID 唯一、父日均存在、旧行 ID 消失，新身份正确回绑；再次保存不新增请求。因此保留已保存行的日期入口。证据边界是现有后端 batch 契约下的前端请求与返回树，不是线上数据库实测。

独立审查：Standards 首轮 1 个 P1、Spec 首轮 1 个 P1，均指向同一问题——界面按显式星期落列，日期模型却重新推导 Dx，连续操作可能搬错行。已统一传入 blockWeekdays，并在改日期时保留其他列的星期规则；新增两条连续交互测试从 2 红转 18 绿，同时断言实际行 ID 和相邻列。两轴定向复核均确认该项关闭，未发现本轮其他实质缺陷。未将审查当作 Opus 最终验收。

最终命令结果：

- `npm test`：exit 0，**96 files / 911 tests**，14.32s；`/tmp/card-a-r1-full-final.log`。
- `npx tsc --noEmit`：exit 0，无诊断；`/tmp/card-a-r1-tsc-final.log`。
- `npm run build`：exit 0，Vite 2.20s；保留既有 >500 kB chunk 提示；`/tmp/card-a-r1-build-final.log`。
- `git diff --check`：exit 0。4 个受保护测试与 reconcile/lockfile diff 均为空。

本轮未验证：真实浏览器中修订后的 5 行卡实际高度及多组输入滚动。CSS/DOM 回归证明控件同排，但不冒充约 400px 的实测。浏览器现有标签没有本地验收页；尝试正常 Vite 服务仍被沙箱拒绝，未改端口/协议或安全配置绕过，原始输出 `/tmp/card-a-r1-vite.log`：

```text
error when starting dev server:
Error: listen EPERM: operation not permitted 127.0.0.1:5180
    at Server.setupListenHandle [as _listen2] (node:net:1986:21)
    at listenInCluster (node:net:2065:12)
    at node:net:2274:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
```

全部测试正常在 jsdom 运行，没有因沙箱权限而失败的测试。代码返修与自测交回收货，实际编辑卡高度仍需沙箱外浏览器复验。

## 2026-10-19 · 011 卡 B 开发交付（基线 a4afeef）

工作目录 `/Users/david/Projects/apps/meetpr-plan-web-wt-011`；开工先在该目录 mktemp 并删除成功，分支 `feat/011-block-editor`、HEAD `a4afeef`，初始工作树干净。已完整读取 CONTEXT、CLAUDE、SPEC（含屏幕稿转写）及 CARD-B。未 commit、push、开 PR，未修改 lockfile、计划树/v3 快照协议或 reconcile。

实现范围：历史栏常驻、手动折叠记忆、画像/e1RM、按行与组次逐级查询、面包屑/空状态/重试、会话内结果及在途请求缓存；051 filtered_sessions/video_id 与旧后端降级；栏顶 sticky 视频与复用的视频页倍速/逐帧控件；56px 精简顶栏、计划菜单；新建计划与设置、3–6 周默认 4、练日/D1/第一练日期；现有缩周确认及服务端保存流程；app 图标/favicon、编辑器深灰/淡黄配色。删除旧手动保存按钮后，Cmd/Ctrl+S 调用原 handleSave，发布/更新/自动保存/错误处理走原路径。自定义动作仍从动作选择器创建。

星期规律保存为本机按 plan ID 隔离的视图元数据 `meetpr.plan-editor.weekdays.<id>`；计划的 start_date/plan_weeks 仍来自服务端，空骨架按这三项重建。没有给计划树造空训练日，也没有扩展 v3 快照内容或改变其 hash。保存设置同时涉及多个 Dx 时，以原始列映射一次迁移，保留锁定行及未改列的单格日期例外。

### 改动文件（相对仓根，共 33 个）

- `index.html`：favicon。
- `public/meetpr-icon-32.png`、`public/meetpr-icon-64.png`：从 CARD-B 指定 iOS 原图用 sips 缩放；保留原图内容，已查看生成图。
- `src/api/coach.ts`、`src/api/types.ts`、`src/api/coach.test.ts`：sets/reps 请求与可选 051 响应字段、API 回归。
- `src/features/plan-editor/PlanEditor.tsx`：历史栏、设置、组数临时输入、weekday 本机读写、保存与快捷键接线。
- `src/features/plan-editor/blockGridModel.ts`、`src/features/plan-editor/blockGridModel.test.ts`：整套规律同时移动、不交换 Dx、锁定冲突保护及单格例外回归。
- `src/features/plan-editor/components/ContextRail.tsx`、`src/features/plan-editor/contextRail.test.ts`：扩展既有 history seam，查询参数/降级/顶组；保留旧组件与既有测试。
- `src/features/plan-editor/components/BlockHistory.tsx`、`src/features/plan-editor/components/block-history.css`：历史列表/视频/折叠/配色及新对话框、菜单样式。
- `src/features/plan-editor/components/TopBar.tsx`、`src/features/plan-editor/components/TopBar.test.tsx`：顶栏和菜单；旧布局断言迁移为 SPEC 011 布局。
- `src/features/plan-editor/block-history-ui.test.tsx`：最高层 PlanEditor 集成，现代/旧后端、即时收窄、播放焦点、缓存、重开空骨架、缩周/星期保存、英文、冲突保全、日期组合操作。
- `src/features/plan-editor/draftMirror-ui.test.tsx`：保留远端暂存与更新清理断言，旧橙色 inline style 断言改为当前状态/主按钮 class。
- `src/features/plan-editor/exercise-picker-ui.test.tsx`：移除已按 SPEC 下线的顶栏创建入口假设，保留选择器创建绑定及 usage 断言。
- `src/features/plan-editor/input-guard-e2e.test.tsx`、`src/features/plan-editor/saveFailure-ui.test.tsx`：手动保存改从 Cmd+S 触发，原保存/发布与失败断言保留。
- `src/features/plan-editor/locked-ui.test.tsx`：日期锁定从计划设置检查，已发布状态断言适配单一更新按钮。
- `src/features/workspace/CoachShell.tsx`：左上角原 M 标识换指定 app 图标。
- `src/features/workspace/PlanDialogs.tsx`、`src/features/workspace/PlanDialogs.test.tsx`：新建/设置共用练日、D1、日期、周数表单与交互回归。
- `src/features/workspace/blockPlanSettings.ts`、`src/features/workspace/blockPlanSettings.test.ts`：Dx 循环排序、最近星期日期、按计划保存/读取规律。
- `src/features/workspace/PlanWorkspace.tsx`、`src/features/workspace/PlanWorkspace.test.tsx`：创建后保存规律、旧后端视频页导航、新建请求/本机数据证据。
- `src/features/workspace/VideoTransport.tsx`、`src/features/workspace/VideosPage.tsx`：抽出并共用视频页原有倍速和逐帧控件，保留原 frameStepTime。
- `src/i18n/strings-block.ts`、`src/i18n/strings.ts`：完整中英文新文案。
- `docs/CODEX-JOURNAL.md`：本条开发证据。

### 先红后绿（实际运行）

下列命令均为 `npm test -- <路径>`；路径以仓根为起点。

| 测试路径 | 实际红结果 → 绿结果 |
| --- | --- |
| `src/features/plan-editor/contextRail.test.ts src/api/coach.test.ts` | 2 failed / 17 passed → 19 passed：查询参数、旧后端降级、顶组并列 |
| `src/features/plan-editor/block-history-ui.test.tsx` | 常驻/播放首轮 1 failed → 1 passed；空骨架与设置增量 1 failed / 2 passed → 3 passed；清空组数即时回退 1 failed / 3 passed → 4 passed；同时改周数+星期漏保存 1 failed / 4 passed → 5 passed；最终补齐英文、冲突拒绝、组合日期共 8 passed |
| `src/features/workspace/blockPlanSettings.test.ts src/features/workspace/PlanDialogs.test.tsx` | 新模型模块未实现导致 1 suite 导入失败，另 1 failed / 1 passed → 3 passed |
| `src/features/plan-editor/components/TopBar.test.tsx` | 2 failed → 2 passed：56px、指定元素/菜单、发布和更新 |
| `src/features/plan-editor/blockGridModel.test.ts` | 同时移动 1 failed / 6 passed → 7 passed；未改列单格例外 1 failed / 7 passed → 8 passed |

补证不冒充先红：旧后端 UI、英文、删除有内容 Dx 的拒绝、组合第一练日期、Workspace 创建后存储断言是在相关实现后补充验证。历史 UI 最初一次夹具使用 Node 全局 localStorage.clear 报 `TypeError: localStorage.clear is not a function`，改为测试自有内存 Storage 边界后，重新跑出业务红；不是沙箱权限错误，也未修改 Vitest 配置或测试基础设施。中途对话框默认名字断言误写“新建计划”，改为已有实际默认“新计划”。

首次全量为 10 failed / 907 passed，均为被 SPEC 替换的顶栏/日期入口或样式假设；迁移上述入口后保持原业务断言。原 `selectionModel`、`clipboard`、`dayMove`、`reconcile` 测试未改；`block-grid-ui`、`block-date-save` 未改，最终全绿。

重开证据：组件先以空 4 周服务端骨架与 `[6,1,3,4]` 本机规律打开，断言 16 格及日/二/四/五列头；缩为 3 周，验证确认与 onChangePlanWeeks(3)；改 D2 为周三后用新 key 重挂载编辑器，仍显示 12 格和 D2 周三。Workspace 测试同时证明新建请求 plan_weeks=4、anchor_weekday=1，并保存 `[0,2,4,5]`。此证据覆盖同浏览器重开，不是跨设备同步或真实服务器部署证据。

### 独立审查与最终检查

按 code-review 分 Standards/Spec 两个只读子代理审查工作树（含新增文件）。Standards 的同时改周数/星期漏自动保存已修并以实际 onSave 回归验证；多列规律与移除有内容列静默接受问题已修。缩周失败恢复的初始疑问在复核 resizeServerPlanWeeks 与 reconcilePlan 均先 getPlan 后撤回，没有不读服务器的恢复写路径。Spec 的 Dx 内容交换、播放器滚走及未改列日期例外被复位三项均修复并经定向只读复核关闭。不存在未关闭的本轮审查 finding；这不替代 Opus 终审。

最终结果：

- `npm test`：exit 0，**98 files / 924 tests**，9.43s；`/tmp/meetpr-card-b-test-final.log`。
- `npx tsc --noEmit`：exit 0，无诊断。
- `npm run build`：exit 0，Vite 3.18s；保留已有 >500 kB chunk 提示；`/tmp/meetpr-card-b-build-final.log`。
- `git diff --check`：exit 0。
- Impeccable 对本次 UI 文件机械检查返回 `[]`；这不是浏览器视觉验收。

### 边界与留给收货方的验收

- 星期规律只保存在同一浏览器；换设备/清理站点存储后没有规律副本。SPEC 允许实装决定存法，同时禁止修改快照模型，因此采用独立视图元数据；跨设备同步不作完成声明。
- SPEC 没有定义从规律中删除仍有内容的 Dx 应如何处置；本实现明确拒绝且不删数据。与锁定日期碰撞同样拒绝整次规律调整。需要支持删有内容练日时，先由 David/Opus 明确其内容去向。
- 未部署后端 051，现代/旧契约均在 jsdom API 边界验证；未连接线上写数据。
- 无本轮浏览器截图或真实媒体播放证据，1440×900 布局、视频播放/倍速/逐帧实际效果与 SPEC 其余浏览器条目交 Claude/Opus 亲验。普通 dev server 启动已被沙箱拒绝；未换端口、协议或修改基础设施绕过。原始报错见 `/tmp/meetpr-card-b-vite.log`：

```text
error when starting dev server:
Error: listen EPERM: operation not permitted 127.0.0.1:5180
    at Server.setupListenHandle [as _listen2] (node:net:1986:21)
    at listenInCluster (node:net:2065:12)
    at node:net:2274:7
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
```

以上为开发、自测及代码自审交付，不宣称浏览器验收或可合并门禁通过。

## 2026-10-19 · 011 卡 B 定向返修：草稿失败后可见重试

收货反馈要求恢复旧「保存草稿」入口移除后丢失的失败恢复路径。本次仅在可编辑草稿的自动/手动保存失败状态旁显示「重试保存」/「Retry save」，点击复用原 `handleSave → saver.saveNow()`，保留未绑定行确认和串行保存。开始下一次保存时清除失败状态；若再次失败重新显示，成功后保持隐藏。正常、已发布、只读状态不新增入口；永久校验错误与锁定冲突保留原专门提示。

本次返修改动文件：

- `src/features/plan-editor/PlanEditor.tsx`：保存失败状态与原手动保存接线。
- `src/features/plan-editor/components/TopBar.tsx`：状态旁的条件重试按钮。
- `src/i18n/strings-block.ts`：中英文按钮文案。
- `src/features/plan-editor/saveFailure-ui.test.tsx`：最高层 PlanEditor 回归，两种语言 × 自动/手动保存失败，断言初始无按钮、失败出现、点击再次调用 onSave 且携带当前编辑、成功后消失。
- `docs/CODEX-JOURNAL.md`：本条证据。

先红后绿（实际运行，未改测试基础设施）：

- 红：`npx vitest run src/features/plan-editor/saveFailure-ui.test.tsx` → **4 failed / 13 passed**，exit 1；四条均停在 `expect(retryButton()).toBeDefined()`，错误为 `AssertionError: expected undefined to be defined`。
- 绿：`npx vitest run src/features/plan-editor/saveFailure-ui.test.tsx src/features/plan-editor/components/TopBar.test.tsx` → **2 files / 19 passed**，exit 0。
- `npm test` → **98 files / 928 passed**，exit 0（14.30s）；原始日志 `/tmp/meetpr-card-b-retry-test.log`。
- `npx tsc --noEmit` → exit 0，无诊断。
- `npm run build` → exit 0，Vite 2.25s；保留已有 >500 kB chunk 提示；原始日志 `/tmp/meetpr-card-b-retry-build.log`。
- `git diff --check` → exit 0；锁文件、block-grid-ui、block-date-save、reconcile 测试未改。
- code-review 的 Standards / Spec 两个只读定向审查均无具体缺陷；审查者未独立重跑测试。

用户转述 Claude 已在沙箱外完成此前卡 B 的三项命令与 1440×900 浏览器收货，并裁决接受本机星期规律存储和拒删有内容 Dx；本次未改这两项。上述浏览器证据属于 Claude，不是本轮重试按钮的浏览器验收；该按钮本轮以 jsdom 最高层交互验证，未绕过此前 dev server 的 EPERM 限制。无新产品疑问或已知 SPEC 偏离；未 commit、push 或改锁文件。

## 2026-10-19 · 011 卡 C：视频大窗与拖动把手（基线 ee2de70）

已核实分支 `feat/011-block-editor`、HEAD `ee2de70`，开工工作树干净，仓根临时文件写入/删除成功。重读 CONTEXT、CLAUDE、完整 SPEC（含新版 §2、§3.3、验收 4 与「⑤ 看视频」转写）及 CARD-C。本轮只交开发、自测和代码审查，浏览器收货依卡交 Claude。

### 本轮实现与改动文件

- `src/features/plan-editor/components/BlockHistory.tsx`：移除历史栏内播放器，在栏外浮动同一个视频窗；以栏位置定位右侧 8px 间距、顶部 10px 间距，标准画面 405×720，按可用高度/宽度等比缩小；原比例 contain、横屏黑边。标题包含日期、动作、组序、重量×次与 RPE；Esc/关闭、进度、时间、播放暂停、倍速、逐帧均在窗内。按 video_id 高亮记录及组，切换沿用窗节点；旧后端仍跳视频页。恢复编辑光标后再关闭动作搜索浮层，保证第二次 Esc 收起编辑卡。
- `src/features/plan-editor/PlanEditor.tsx`：只新增视频可见性与动作名输入框的 Esc 协调；保存、模型、网格、复制及更新路径未改。
- `src/features/plan-editor/components/block-history.css`：浮层定位/外观、9:16 contain 画面、播放控件、记录 #FFFBEB 与组 #FEF3C7 高亮。历史栏宽度和列表布局不变。
- `src/features/plan-editor/components/block-grid.css`：编辑行把手非悬停隐藏、悬停浅灰，选中/悬停都不再深色背景；排序实现未动。
- `src/features/workspace/VideoTransport.tsx`：继续复用视频页控件；compact 模式补 0.25× 和逐帧短标签，视频页默认模式不变。
- `src/i18n/strings-block.ts`：中英文逐帧短标签；标题/关闭/播放/进度沿用已有双语字符串。
- `src/features/plan-editor/block-history-ui.test.tsx`：新增 7 条最高层 PlanEditor 用例；既有 8 条断言保留。
- `src/features/plan-editor/week-band-ui.test.tsx`：新增 1 条把手计算样式回归；既有排序测试保留。
- `docs/CODEX-JOURNAL.md`：本条证据。

### 先红后绿（均实际运行）

以下每轮均先新增失败用例、执行红灯，再改实现：

| 命令 | 红灯 | 转绿 |
| --- | --- | --- |
| `npx vitest run src/features/plan-editor/block-history-ui.test.tsx`：浮窗/历史/切换/两次 Esc | 1 failed / 8 passed：找不到浮窗 | 9 passed |
| 同上：中英文控件、1440×900 / 1024×600 尺寸与 resize | 2 failed / 9 passed：缺 0.25× | 11 passed |
| `npx vitest run src/features/plan-editor/week-band-ui.test.tsx`：把手 | 1 failed / 4 passed：visibility 实为 visible | 5 passed |
| `npx vitest run src/features/plan-editor/block-history-ui.test.tsx`：动作名输入框 Esc | 1 failed / 11 passed：Esc 后视频仍在 | 12 passed |
| 同上：同日两条处方不同视频 | 1 failed / 12 passed：两条记录同时高亮 | 13 passed |
| 同上：播放后再聚焦动作名 | 1 failed / 13 passed：Esc 后视频仍在 | 14 passed |
| 同上：进度条真实获得焦点后关闭 | 1 failed / 14 passed：第二次 Esc 后编辑卡仍在 | 15 passed |

最终定向命令 `npx vitest run src/features/plan-editor/block-history-ui.test.tsx src/features/plan-editor/week-band-ui.test.tsx`：**2 files / 20 passed**，exit 0。计算样式使用现有 block-grid-ui 的 readFileSync 加载真实 CSS 做法；未改 Vitest 配置或测试基础设施，也未遇到测试沙箱权限失败。

### 审查与最终三项检查

按 code-review 执行独立只读 Standards / Spec 审查 `git diff ee2de70`。两轴发现的同日记录串高亮已修复并补红绿证据；Standards 复核发现的进度条焦点恢复顺序问题也补红绿证据修复。最终 Standards 与 Spec 均无未关闭问题；审查者未独立重跑测试。

最后一次三项命令（最后语义改动之后）：

- `npm test`：exit 0，**98 files / 936 passed**，8.98s；日志 `/tmp/meetpr-card-c-test-final.log`。
- `npx tsc --noEmit`：exit 0，无诊断。
- `npm run build`：exit 0，Vite 2.26s；保留已有 >500 kB chunk 提示；日志 `/tmp/meetpr-card-c-build-final.log`。
- `git diff --check`：exit 0。

`block-grid-ui`、`blockGridModel`、`block-date-save`、`saveFailure-ui`、`reconcile` 等受保护测试与锁文件均无改动，全量通过。卡 A/B 的原有 block-history 与 week-band 用例保留。未 commit、push、开 PR 或写线上数据。

### 验收边界

无已知 SPEC 偏离或新增产品决策。jsdom 证据覆盖浮窗 DOM 位置、真实 CSS 的宽度/比例/颜色、已给定浏览器几何边界下的定位和缩放、视频 API/控件与焦点行为；不等于浏览器渲染或真实媒体播放验收。按 CARD-C，浏览器尺寸/视频播放/横屏黑边/悬停效果交 Claude 在沙箱外亲验；本轮未启动服务或绕过此前 EPERM 限制。

## 2026-10-19 · 011 卡 D：逐组强度 / 重量框裁切热修

基线 `fix/011-per-set-boxes` / `2b41fe2`，开工工作树干净。Step 0 先在本工作树创建并删除临时文件，exit 0；随后读取 CONTEXT、CLAUDE、CARD-D 和 SPEC。

根因：block-grid.css 将强度和重量控件设为 `flex-wrap: nowrap` 与 `overflow-x: auto`，窄列把后续逐组框藏进横向滚动区域。行及单元格原本已有 `height: auto`，无需修改行高或网格结构。

改动文件：

- `src/features/plan-editor/components/DayColumn.tsx`：仅给实际逐组强度、逐组重量容器添加 `is-per-set` 展示 class。
- `src/features/plan-editor/components/block-grid.css`：仅覆盖这两种逐组容器为 `flex-wrap: wrap`、双轴 overflow visible；沿用原行高自适应。普通单值容器沿用全部原样式。
- `src/features/plan-editor/block-grid-ui.test.tsx`：新增 3 组 / 10 组最高层 PlanEditor 回归，验证所有 RPE / 重量框在 DOM、可聚焦输入、实际 CSS 允许换行且不裁切、行和单元格高度为 auto；原单值行及卡 A/B/C 用例保留。
- `docs/CODEX-JOURNAL.md`：本段证据。未修改数据模型、reconcile 或锁文件，未 commit / push。

先红后绿（均实际执行同一命令 `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx`）：

```text
RED:  Test Files 1 failed (1); Tests 2 failed | 18 passed (20); exit 1
      3 组和 10 组均报 AssertionError: expected 'nowrap' to be 'wrap'
GREEN: Test Files 1 passed (1); Tests 20 passed (20); exit 0
```

原始输出：`/tmp/meetpr-card-d-red.log`、`/tmp/meetpr-card-d-green.log`。

代码自审：按 code-review 对 `git diff HEAD`（基线 `2b41fe2`，未提交）做独立只读 Standards / Spec 两轴审查，均无发现；审查者未独立重跑测试。

修复后的全量验证：

- `npm test`：exit 0，98 files / 938 passed，9.22s；`/tmp/meetpr-card-d-test.log`。
- `npx tsc --noEmit`：exit 0，无诊断；`/tmp/meetpr-card-d-tsc.log`。
- `npm run build`：exit 0，Vite 2.50s；保留已有 >500 kB chunk 提示；`/tmp/meetpr-card-d-build.log`。
- `git diff --check`：exit 0。

验收边界：本轮 jsdom 验证 DOM、交互和真实 CSS 规则，不提供浏览器几何布局证据。1440px 宽、历史栏展开时 10 组全部可见且逐框可点可输，按 CARD-D 交 Claude 在沙箱外浏览器亲验；本轮不声明该浏览器验收已通过。

## 2026-10-19 · SPEC 012：插入 / 删除训练日

基线 `feat/012-insert-delete-day` / `0be8622`；全程工作目录 `/Users/david/Projects/apps/meetpr-plan-web-wt-011`。第一项操作是在该目录创建并删除临时文件，exit 0；随后完整读取 CONTEXT、CLAUDE、CARD、SPEC 012，以及 SPEC 011 §1/§4/§5。SPEC 012 是本轮唯一验收口径。

### 改动文件

- `src/features/plan-editor/blockGridModel.ts`：每周按实际日期编号；枚举本周空日期、插入和受锁保护的删除；区分规律列与额外列，保留 011 旧计划落列、日期编辑、填充规则。
- `src/features/plan-editor/components/BlockGrid.tsx`、`components/DayColumn.tsx`、`components/block-grid.css`、`PlanEditor.tsx`：星期列头、卡片与编辑头 Dx、缝隙/首尾插入入口、确认删除/撤销、打卡锁、额外列空白与自动收起。
- `src/features/workspace/blockPlanSettings.ts`：沿用本地展示配置，另存额外星期，避免重开把单周插入变成规律。
- 新增 `src/features/plan-editor/saveBlockPlan.ts`，并接入 `src/features/workspace/PlanWorkspace.tsx`：先执行真实 reconcile，再用现有 batch API 保存显式纯空日；带版本条件、分批写入、使用回包同步日程。普通无空日保存不增加 GET。`reconcile.ts` 未改。
- `src/features/plan-editor/mapping.ts`、`draftMirror.ts`、`PlanEditor.tsx`：使用已有 rest 字段区分正式空日与休息槽位，保存/恢复空日结构；快照字段与 v3 版本不变，兼容旧 v3 哈希与已有空日身份，恢复时保留服务端打卡锁。
- `src/i18n/strings-editor.ts`：中英文插入、仅部分周出现、删除确认与锁定提示。
- 测试：`blockGridModel.test.ts`、`block-grid-ui.test.tsx`、`block-date-save.test.ts`、`draftMirror-ui.test.tsx`、`draftMirror.test.ts`；`block-history-ui.test.tsx` 迁移 Dx 显示位置断言；`locked-ui.test.tsx` 将原单日 Delete 清空断言改为右键 Clear day，保留原打卡行保护断言。
- `docs/CODEX-JOURNAL.md`：本段。没有修改持久化数据结构、后端、锁文件，也没有 commit / push / PR。

### 实际红 → 绿

以下命令均先实际观察失败，再实现对应行为；数字来自本轮工具输出，非推算。路径均以 `src/features/plan-editor/` 为前缀。

| 命令 | RED | GREEN |
|---|---|---|
| `npx vitest run src/features/plan-editor/blockGridModel.test.ts`：每周 Dx | 1 failed / 8 passed | 9 passed |
| 同命令：插入 / 删除 | 分别 1 failed / 9 passed、1 failed / 10 passed | 分别 10、11 passed |
| 同命令：额外列填充、空日碰撞与规律调整、重载推导 | 分别 1 failed / 11、12、13 passed | 分别 12、13、14 passed |
| `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx`：列头与卡片、插入、删除锁 | 分别 1 failed / 20 passed、1 failed / 21 passed、2 failed / 22 passed | 分别 21、22、24 passed |
| 同命令：已发布纯空日未推送状态 | 1 failed / 28 passed | 29 passed |
| `npx vitest run src/features/plan-editor/block-date-save.test.ts`：纯空日真实保存边界 | 2 failed / 4 passed（预期 batch 请求 1，实际 0） | 6 passed |
| 同命令：普通日期移动不创建幽灵空日、已存空日移动不残留源日 | 分别 2 failed / 6 passed、2 failed / 8 passed | 分别 8、10 passed |
| `npx vitest run src/features/plan-editor/draftMirror-ui.test.tsx`：实际 planId 下纯空日增删的本地/远端快照与重开恢复 | 2 failed / 33 passed | 35 passed |
| 同命令：旧快照空日兼容、移走源日快照 | 2 failed / 35 passed | 37 passed |

额外的草稿自动保存测试首次 1 failed / 29 passed，定位为测试回调原样返回同一 weeks 引用，与真实 reconcile 回包不同；改为克隆回包后 30 passed，未因此修改生产逻辑。该项不计作生产修复的红绿证据。

### SPEC 验收清单与测试 seam 对照

1. `blockGridModel` / `block-grid-ui`：按周日期顺序编号、星期列头、卡片与编辑头同步。
2. 同上：W2 周三与周五之间插周四，W2 D1–D5、其余周编号和内容不变，额外列空白。
3. 同上：空日期枚举、相邻无空日隐藏入口、首尾入口、只读隐藏；已有列复用。
4. 同上及 `locked-ui`：Delete 和右键删除、确认取消/执行、撤销、打卡锁与提示。
5. 既有积木选区 Delete 回归保留；右键 Clear day 保留内容清空语义。
6. 模型与组件覆盖删除最后一个额外日后收列、规律列保留。
7. `block-grid-ui` / `block-date-save` / `draftMirror-ui`：草稿自动保存；已发布插入（含纯空日）/删除仅在 Update plan 后保存并重开；不编辑不保存；真实 reconcile + 内存 API 边界验证请求和回读，无孤儿日。存量 011 夹具全绿。
8. 中英文文案与下列三项检查。

### 审查与最终验证

独立只读 Standards / Spec 审查基线 `0be8622`。审查发现的保存后幽灵空日、纯空日快照与重载缺口已补测试修复；Standards 最后指出的恢复回调 `studentAddedByDay` 依赖已补齐。Spec 复核无剩余明确缺口。两轴审查不替代 Opus 浏览器验收。

- `npm test`：exit 0，**98 files / 967 passed**，8.87s；日志 `/tmp/meetpr-012-test-final.log`。
- `npx tsc --noEmit`：exit 0，无诊断；日志 `/tmp/meetpr-012-tsc-final.log`。
- `npm run build`：exit 0，Vite 2.55s；保留已有 >500 kB chunk 提示；日志 `/tmp/meetpr-012-build-final.log`。
- `git diff --check`：exit 0。

### 不确定处与验收边界

未发现已知 SPEC 偏离。SPEC 写的是选中整张日卡删除；多日选区 Delete 按 011 保留原清空行为，单日 Delete 使用新删除行为。为满足空日插入，保存适配器调用现有 batch API，未更改 reconcile 本身或接口结构；测试使用真实 reconcile 和 mock 服务端状态，不是线上部署证据。浏览器亲验按 CARD 由 Claude 在沙箱外完成，本轮未执行、不宣称通过。

## 2026-10-19 · SPEC 012 第 1 轮返修：空日交付门禁与显式删除

继续在 `feat/012-insert-delete-day` / `0be8622` 未提交工作树实施。重读 Claude 更新的 SPEC §4 两条；本段取代上轮“已发布纯空日可更新”的行为说明。用户已报告上一轮 967 测试及 1440×900 浏览器部分验收通过；本轮不把该证据视为新增返修的浏览器验收。

### 本轮改动文件

- `src/features/plan-editor/PlanEditor.tsx`：首次发布与更新前拦空日，按周 Dx/日期给出中英文提示，空日计入待核对并逐个定位；草稿保存不拦。记录 Delete / 删除这天产生的 ID，随撤销/重做保存动作历史；保存途中删除的新日待回包后绑定 ID。运行时身份随保存克隆延续，避免把旧日删除记录转移给同槽替代日；插入/填充替代后当前删除意图失效，Undo 仍可恢复旧动作。
- `src/features/plan-editor/saveBlockPlan.ts`：空日的已发布写入在请求前拒绝；调用方仍为草稿时另核实服务端最新状态。删除空日仅接受 `deletedDayIds` 白名单，不再从页面缺席推断。保留的服务端空日回包恢复 `rest:false`，仍参与待核对及门禁。
- 新增 `src/features/plan-editor/dayDeletionIntent.ts`：本地编辑元数据按 planId/快照 hash 保存明确 ID；不改计划树、DayCol 或远端 v3 快照结构。丢弃、已覆盖、回到无候选基线时清理；运行时 token 不序列化。
- `src/features/workspace/PlanWorkspace.tsx`：把显式删除 ID 传给保存适配层。
- `src/i18n/strings-editor.ts`：空日门禁与待核对提示，中英文齐全。
- `src/features/plan-editor/block-grid-ui.test.tsx`：发布/更新零请求、逐个定位、草稿自动保存、显式删除及多轮撤销重做、保存竞态、替代日身份，中英文断言。
- `src/features/plan-editor/block-date-save.test.ts`：真实 reconcile 边界的隐藏空日保留、白名单删除、空日发布阻断、远端已发布竞争与空日回包。
- `src/features/plan-editor/draftMirror-ui.test.tsx`：同机恢复后继续更新会携带明确删除 ID；没有匹配记录或已丢弃记录时保留服务端空日。
- `docs/CODEX-JOURNAL.md`：本段。SPEC.md 的变更来自用户，本轮未改该文件。

### 实际红 → 绿

所有 RED 都在对应实现之前实际执行；以下前缀均为 `npx vitest run src/features/plan-editor/`，每次使用同一测试文件复跑。

| 测试文件 / 行为 | RED | GREEN |
|---|---|---|
| `block-grid-ui.test.tsx` 发布/更新拦空日及芯片 | 2 failed / 29 passed | 31 passed |
| `block-date-save.test.ts` 页面未展示的服务端空日保留 | 1 failed / 10 passed | 11 passed |
| `block-grid-ui.test.tsx` Delete/右键白名单与Undo/Redo | 2 failed / 31 passed | 33 passed |
| `block-date-save.test.ts` 保存边界已发布空日拒绝 | 1 failed / 10 passed | 11 passed |
| `block-grid-ui.test.tsx` 保存→Undo保存新ID→Redo | 1 failed / 33 passed | 34 passed |
| `block-date-save.test.ts` 远端发布竞争、保留源空日参与门禁 | 3 failed / 9 passed | 12 passed |
| `block-grid-ui.test.tsx` 保存中删除尚无ID的新日 | 1 failed / 34 passed | 35 passed |
| `draftMirror-ui.test.tsx` 恢复明确删除后继续Update | 1 failed / 36 passed | 37 passed |
| `block-grid-ui.test.tsx` 同槽替代日不继承旧删除 | 1 failed / 35 passed | 36 passed |
| 同文件：同ID替代、连续两轮Undo/Save/Redo | 2 failed / 37 passed | 39 passed |
| `draftMirror-ui.test.tsx` 丢弃记录不再授权旧镜像删除 | 1 failed / 38 passed | 39 passed |

原始日志：`/tmp/meetpr-012-r1-{gate,delete,intent,savegate,redo,boundary,inflight,recovery,lineage,history,discard}-{red,green}.log`。最后的 `history-green` 同时跑组件与镜像两文件，77 passed；中英文和无本机证据的补充断言包含在最终全量内。新 SPEC 明确替换的旧“已发布可保存空日”断言已改为阻断；011 非空日日期移动、reconcile 及其受保护测试未改。

### 独立审查与最终命令

Standards：定向审查发现的服务端发布状态竞争、保存中无 ID 删除、身份误回绑及多轮恢复问题均补红绿修复，复审无剩余问题；最后确认本地删除记录清理不会覆盖待恢复候选。

Spec：更新后的 §4 门禁/白名单、空日回包和恢复闭环均已定向复核；同槽新/旧 ID 替代问题已关闭。两轴均为代码自审，不代替 Claude 浏览器收货。

- `npm test`：exit 0，**98 files / 980 passed**，9.36s；`/tmp/meetpr-012-r1-test-final.log`。
- `npx tsc --noEmit`：exit 0，无诊断；`/tmp/meetpr-012-r1-tsc-final.log`。
- `npm run build`：exit 0，Vite 2.93s；已有 >500 kB chunk 提示仍在；`/tmp/meetpr-012-r1-build-final.log`。
- `git diff --check`：exit 0。

未改 reconcile、后端、计划数据结构、锁文件；未 commit / push / 开 PR。

### 按新增条款字面执行的边界

1. 纯空日改日期/规律时，不再推断删除服务端源空日：目标空日可保存，源空日保留并进入待核对；要移除源日需明确 Delete。该行为是“只允许 Delete / 删除这天产生删除 ID”的字面执行。011 的非空处方移动仍使用原 reconcile 路径，全量回归通过。
2. 明确删除记录只存本机编辑元数据，不新增远端快照字段。跨设备恢复、存储失败或缺少匹配 hash 时，服务端空日保留，教练需再次明确删除；不会把镜像里缺席当作删除授权。同机记录匹配的删除恢复可继续更新。
3. 本轮新增交互仅有组件证据，真实浏览器复验仍交 Claude；未写线上数据。

## 2026-10-19 · SPEC 012 CARD-E：列头、积木、撤销收列与常驻插入入口

### 范围与现场

工作树 `meetpr-plan-web-wt-011`，分支 `fix/012-headers-bricks`。第一条 shell 命令使用 `mktemp .codex-write-check.XXXXXX` 后立即删除，exit 0，确认可写。开工 HEAD `bdf89c3`、工作树干净；期间外部提交 `d0e5e53` / `7476c3b` 追加卡片第 3/4 项，David 在同一线程明确要求继续，最终 HEAD `7476c3b`。本代理没有 commit / push，也未修改卡片、锁文件、数据结构或 reconcile。

### 改动文件

- `src/features/plan-editor/components/BlockGrid.tsx`：沿用已有 `patternIndex` 区分规律列（包含数据投票推出的列）与额外列；只有额外列在不足一半的周出现才标记。列头 title 使用完整显示文案，积木 title 使用完整动作名与速记；移除名字子元素的单独 title，避免覆盖整块悬停全文。
- `src/features/plan-editor/components/block-grid.css`：列头宽度受列约束、单行省略；积木按内容宽度换行，名字至少 `min(6em, 100%)`，第二行速记靠右、溢出省略，短行 24px。插入按钮常驻 18px 灰色圆形，hover/focus 加深；空格＋常驻。保留原网格轨道与缝隙定位，未改只读渲染条件。
- `src/i18n/strings-editor.ts`：只显示前三个周号，超过三个时给出总周数；中英文都表示总周数，不是剩余数。（历史实现；已由后续列头简化热修删除。）
- `src/features/plan-editor/mapping.ts`：草稿保存回包不再把新建日的 ID/完成态回填进插入前完全缺席的休息日历史；原有真实训练日与发布态日程投影继续保留。
- `src/features/plan-editor/PlanEditor.tsx`：Undo/Redo 使训练日从当前树消失时，将明确移除的源 ID 纳入现有删除意图；沿用 sourceToken 处理在途保存回包。连续撤销/重做保留目标仍缺席的待删日，恢复日则取消对应当前待删记录。没有修改保存适配器或服务端删除门禁。
- `src/features/plan-editor/block-grid-ui.test.tsx`：12 周夹具（W1=2026-01-12，每周原有四练，少数周插入第五练，W6/W7 少一练）含长名、逐组重量和逐组 RPE；覆盖稀有列、半数边界、推断规律列、中英文、省略与悬停 CSS/DOM、撤销保存重挂载、在途保存、连续 Undo/Redo 和常驻＋/只读。
- `docs/CODEX-JOURNAL.md`：本段。

### 实际红 → 绿

所有下表红例均在对应修复前实际执行。统一命令前缀：

```sh
npx vitest run src/features/plan-editor/block-grid-ui.test.tsx
```

| 追加参数 | RED 失败摘要 | GREEN |
| --- | --- | --- |
| `-t 'labels only rare\|shows only weekdays'` | 4 failed：规律列列出 10 个周号；恰好 6/12 周仍有标记；没有 3 周截断 | 4 passed |
| `-t 'clips legacy'` | 1 failed：缺 title、宽度上限及 nowrap/ellipsis | 1 passed |
| `-t 'lets long per-set bricks'` | 1 failed：固定 24px、不换行，速记 flex-shrink=0，缺全文 title | 1 passed |
| `-t 'removes an inserted extra\|ignores stale extra'` | 2 failed：保存回包带新 serverDayId 后，Undo 与重挂载仍是 5 列而非 4 列 | 2 passed |
| `-t 'ignores stale extra'` | 加强保存边界后 1 failed：删除 ID 为 `[]`；模拟保存适配器保留服务端空日，休息日又变训练日 | 通过；与前一用例合跑 2 passed |
| `-t 'shows gap and empty-cell plus'` | 1 failed：两种＋的 opacity=0，插入按钮仍 20px 且颜色不符 | 1 passed |
| `-t 'retains all pending insertion'` | 1 failed：双插入保存→连续撤销→重做→再撤销遗漏 `inserted-1`；重挂载仍有 5 列 | 全组件文件 52 passed |

表内 `\|` 仅为 Markdown 转义，实际 shell 参数使用普通 `|`。原始日志：`/tmp/meetpr-012-e-{headers,clipping,bricks,undo,undo-save,plus,multiundo}-{red,green}.log`；最后的 `multiundo-green.log` 跑完整组件文件。补充未保存即撤销及在途保存的边界命令为同一前缀加 `-t 'extra column on undo|ignores stale extra|autosave is in flight'`，5 passed，日志 `/tmp/meetpr-012-e-undo-boundaries.log`。

第 3 项最初在“不返回服务端 ID”的简化回包下，插入后立即 Undo 已经通过；不是有效红例。改成接近真实自动保存的回包后才复现。证实根因是历史身份回填与逆操作缺少删除意图，不能仅删除本机 extra-weekdays。已有 `buildBlockGrid` 会忽略树中没有训练日的额外星期，因此保留本机元数据并沿用现有过滤，无需改列模型。保存 stub 进一步模拟了现有适配器“无明确删除 ID 则保留服务端空日”的规则；没有把本地模拟称为真实服务端部署验证。

### 独立审查与最终验证

按 `review-loop` 做独立只读 Standards / Spec 审查。初始两项两轴均无 findings；新增第 3/4 项时两轴都指出连续撤销会覆盖前一次删除意图。已补上真实失败用例并定向修复，两轴复审均关闭该 P1、无新增 findings。本仓缺 `docs/agents/issue-tracker.md`，使用 review-loop 的本地 spec 双轴流程；若启用完整 tracker 工作流需另由 David 调用 `$setup-matt-pocock-skills`，本次未创建配置。

- `npm test`：exit 0，**98 files / 993 passed**，10.87s；`/tmp/meetpr-012-e-complete-test.log`。
- `npx tsc --noEmit`：exit 0，无诊断；`/tmp/meetpr-012-e-complete-tsc.log`。
- `npm run build`：exit 0，Vite 2.53s；仅已有 >500 kB chunk 提示；`/tmp/meetpr-012-e-complete-build.log`。
- `git diff --check`：exit 0。Impeccable 对改动 UI 文件的机械扫描返回 `[]`。
- 保存、镜像、后移的既有测试在最终全量中全部通过。未改 011/012 的受保护 reconcile、clipboard、selectionModel、dayMove 测试。

浏览器亲验仍按 CARD-E 由 Claude 在沙箱外完成。本轮 DOM/CSS 测试不能证明真实像素尺寸、长行实际换行或按钮无视觉遮挡，不宣称浏览器验收、部署或上线通过。

## 2026-10-19 · 012 加号居中热修

- 现场：`fix/012-plus-center`，开工 HEAD `deedbae`；首条命令创建并删除工作树内临时文件，exit 0。
- 改动：`components/BlockGrid.tsx` 将插入按钮和空格子的全角加号替换为内联 SVG，10×10 viewBox 中两线在 (5,5) 相交，`currentColor`、strokeWidth=1.5、aria-hidden；圆内 SVG 10px，空格 SVG 沿用原 23px 尺寸。`components/block-grid.css` 添加 flex 双轴居中与 line-height:0；保留 18px 圆、颜色、hover/focus、布局与点击行为。路径前缀均为 `src/features/plan-editor/`。
- 测试：`src/features/plan-editor/block-grid-ui.test.tsx` 新增 `centers SVG plus signs in insertion buttons and empty cells`，通过 PlanEditor DOM 和读取实际 CSS 检查两处 SVG、尺寸、隐藏语义、继承颜色及居中样式。
- 红 → 绿命令：`npx vitest run src/features/plan-editor/block-grid-ui.test.tsx -t 'centers SVG plus'`。改实现前 exit 1：`Tests  1 failed | 52 skipped (53)`，失败含 `expected null not to be null`、`expected '＋' not to contain '＋'`、`expected 'inline-block' to be 'flex'`；改后 exit 0：`Tests  1 passed | 52 skipped (53)`。日志 `/tmp/meetpr-plus-red.log`、`/tmp/meetpr-plus-green.log`。
- `npm test`：exit 0，`Test Files  98 passed (98)`、`Tests  994 passed (994)`，10.47s；`/tmp/meetpr-plus-test.log`。
- `npx tsc --noEmit`：exit 0，无诊断；`/tmp/meetpr-plus-tsc.log`。
- `npm run build`：exit 0，`built in 3.45s`，仅 >500 kB chunk 提示；`/tmp/meetpr-plus-build.log`。
- 自审：Standards / 本次用户要求均无发现；`git diff --check` 通过，Impeccable 机械扫描 `[]`。没有 commit、push 或锁文件修改。
- 浏览器验证受限：启动本地 Vite 被沙箱拒绝，原错 `Error: listen EPERM: operation not permitted 127.0.0.1:5187`，未取得截图，不宣称视觉验收完成。
- 期间发现外部修改 `specs/012-insert-delete-training-day/SPEC.md` 的列头说明；本次未触碰或回退，交付范围仍仅两处加号、相关 CSS、新用例与本段记录。

## 2026-10-19 · 012 追加：列头统一只显示星期

- 按 David 新决定修改 `src/features/plan-editor/components/BlockGrid.tsx`：列头与 title 直接使用星期标签，删除周次统计和条件拼接；`src/i18n/strings-editor.ts` 删除对应中英文条目。保留上一轮 SVG/CSS、插入删除和列排列行为。
- 先修改 `src/features/plan-editor/block-grid-ui.test.tsx` 的既有中文、英文、额外列和插入用例，再运行 `npx vitest run src/features/plan-editor/block-grid-ui.test.tsx`：红 `Tests  5 failed | 48 passed (53)`（期望纯星期，实际仍带周次后缀），实现后绿 `Tests  53 passed (53)`。日志 `/tmp/meetpr-weekday-red.log`、`/tmp/meetpr-weekday-green.log`。
- 保留外部 SPEC §1 的新决定，同步 `specs/012-insert-delete-training-day/SPEC.md` 的表述与验收示例，以及 `CARD-E.md` 的对应要求；历史记录的旧英文文案改为语义描述并注明后续删除，历史测试事实保留。
- 全量 `npm test` exit 0：98 files / 994 passed（9.65s）；`npx tsc --noEmit` exit 0 无诊断；`npm run build` exit 0（2.21s），仅 chunk >500 kB 提示。日志 `/tmp/meetpr-weekday-{test,tsc,build}.log`。
- 全仓 `rg --hidden --no-ignore` 搜索旧中英文文案、i18n 键及统计变量（含 docs/specs/dist，仅排除 .git/node_modules），无匹配，rg exit 1；日志 `/tmp/meetpr-weekday-residue.log`。`git diff --check` 通过。未 commit/push，未改锁文件；浏览器验证仍受上一轮本地监听权限限制。
