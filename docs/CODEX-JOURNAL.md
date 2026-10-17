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
