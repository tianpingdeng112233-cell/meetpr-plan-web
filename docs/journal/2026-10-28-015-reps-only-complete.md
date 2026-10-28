# 015 / CARD-1028b：仅组×次完整处方

状态：**阻塞，未完成，不可收货**。2026-10-28；worktree `meetpr-plan-web-wt-015`，分支 `feat/015-sheet-import`，起点 `9a28b82`，开工工作树干净。

已读 CONTEXT、SPEC §2.0.2–2.0.4、CARD-1028b、CLAUDE ④及工程规约。采用 tdd，seam 使用卡片已批准的保存/回读、issue、发布 UI、导入 UI。按用户要求先修改全部测试并记录红，再修改生产代码。

## 完整性规则位置与当前改动

唯一生产代码改动：`src/features/plan-editor/inputGuard.ts` 的 `getBoundRowInputIssue`。删除 `incompleteSet`（每组至少有重量或强度）条件，`hasIncomplete` 改为 `missingReps || missingSets`。已填数值合法性校验、已有豁免保留。

调用链：`isBoundNoSets` → `reconcile.ts/desiredEntries` 的零组降级与 `degradedRows`；`getBoundRowInputIssue` → `PlanEditor.tsx/findDetailedIssueRows`、`findIssueRows`、状态栏和发布前 `cannotPublishIncomplete`。`components/ContextRail.tsx/isRowComplete` 也复用这个谓词，因此全量测试暴露了依赖旧规则的断言。

没有改 reconcile 写组、mapping 回读、opaque 透传、未绑定跳过、后端、W3 测试或暂存逻辑。生产改动尚未形成可验收闭环。

改动文件：
- `src/features/plan-editor/inputGuard.ts`
- `src/features/plan-editor/inputGuard.test.ts`
- `src/features/plan-editor/reconcile.test.ts`
- `src/features/plan-editor/input-guard-e2e.test.tsx`
- `src/features/plan-editor/block-grid-ui.test.tsx`
- `src/features/plan-editor/import/ImportPlanDialog.test.tsx`
- 本 JOURNAL。

## 停止原因：卡片指定的后端门禁

CARD-1028b 原文：“后端 PLAN_PUBLISH_INCOMPLETE 只拦空训练日与零组动作，本卡不动后端；若发现后端另有拦截，停下写进 JOURNAL 交回。”

只读核对关联后端 worktree `/Users/david/Projects/apps/MeetPR-backend-wt-052`，分支 `feat/052-plan-import-ai`，SHA `b208906`。这是本地源码证据，不代表已核对线上部署。

- `src/routes/plans/schemas.ts:283`：新字段请求进入 `validateIntensityState(intensityState(data))`。
- `src/routes/plans/intensity.ts:227`：`case null` 仍 `requireField(state, 'target_weight', issues)`。
- 同文件 `:318`：`intensityWrite` 对无重量、`load_mode:null` 抛出 `validated weight intensity is missing target_weight`。
- 发布计数函数确实只查空天/零组，但请求在保存 schema 阶段已被拒绝，不能靠前端解除门禁完成本卡。

用真实 schema 离线复现（无服务器启动、网络、数据库或写操作）：

```sh
node --import /Users/david/Projects/apps/MeetPR-backend-wt-052/node_modules/tsx/dist/loader.mjs --input-type=module <<'JS'
import schemas from '/Users/david/Projects/apps/MeetPR-backend-wt-052/src/routes/plans/schemas.ts';
const { CreatePlanSetBodySchema } = schemas;
const prescription = { set_number: 1, target_reps: 8, target_reps_max: null, load_mode: null, target_weight: null, target_pct: null, target_rpe: null, rir_target: null, rpe_low: null, rpe_high: null, weight_low: null, weight_high: null, set_type: 'working' };
const result = CreatePlanSetBodySchema.safeParse(prescription);
console.log(JSON.stringify(result.success ? { success: true } : { success: false, issues: result.error.issues }, null, 2));
process.exitCode = result.success ? 0 : 1;
JS
```

exit **1**；1 个用例被拒绝，1 条 issue：`target_weight is required for this load_mode`。发现后停止继续实装，未越权修后端。

## 红 → 绿记录

红、改后尝试使用完全相同的命令：

```sh
npx vitest run src/features/plan-editor/reconcile.test.ts src/features/plan-editor/inputGuard.test.ts src/features/plan-editor/input-guard-e2e.test.tsx src/features/plan-editor/block-grid-ui.test.tsx src/features/plan-editor/import/ImportPlanDialog.test.tsx
```

| 测试文件 / seam | 红（生产代码未改） | 改后结果（未全绿） |
|---|---|---|
| reconcile：数值、区间、AMRAP、力竭保存/回读 | 73 通过 / 4 失败 | 73 通过 / 4 失败 |
| inputGuard：完整性、issue 计数及循环列表 | 31 通过 / 8 失败 | 39 通过 / 0 失败 |
| input-guard-e2e：保存及发布 | 3 通过 / 4 失败 | 7 通过 / 0 失败 |
| block-grid-ui：组×次、无占位/告警 | 63 通过 / 4 失败 | 67 通过 / 0 失败 |
| ImportPlanDialog：归组不设强度/重量，数值及力竭 | 80 通过 / 2 失败 | 82 通过 / 0 失败 |
| 合计 | **exit 1；250 通过 / 22 失败；5 文件失败** | **exit 1；268 通过 / 4 失败；4 文件通过 / 1 失败** |

红原因：仅组×次降级、被列入 issue、发布被拦、导入保存零组。原始输出 `/tmp/015-1028b-red.log`。

改后保存测试先通过了 `degradedRows:0`，但严格 payload 断言漏列现有归一化输出的 `rest_seconds:null` / `coach_note:null`，因此 4 项仍红，回读断言尚未执行。新测试中的空 legacy 投影 fixture 也尚未与真实可存储契约对齐；后端目前根本不接受这种处方，不能用假回包宣称回读通过。发现后端阻塞时停止，保留这些未收敛测试供后续接棒。输出 `/tmp/015-1028b-green.log`，文件名不表示通过。

## 最终检查（发现阻塞后只执行检查与记录）

| 命令 | exit | 结果 |
|---|---:|---|
| `npm test` | **1** | **105 文件：102 通过 / 3 失败；1141 项：1133 通过 / 8 失败** |
| `npx tsc --noEmit` | **0** | 0 类型错误 |
| `npm run build` | **0** | 248 modules transformed；1 条既有大 chunk 提示 |
| `git diff --check` | **0** | 0 空白错误 |

日志：`/tmp/015-1028b-final-test.log`、`/tmp/015-1028b-final-tsc.log`、`/tmp/015-1028b-final-build.log`。

全量失败分布：reconcile 新测试 4 项（上述 payload 断言）；`contextRail.test.ts` 2 项与 `context-rail-ui.test.tsx` 2 项（旧完整性规则及其关联 UI 预期，待续作核对）。`pinyin.test.ts` 7/7 通过，本次不是计时 flake。

W3 的 `.fails` 测试块逐字未改，仍以 expected failure 计入 Vitest 通过数；其旧 `sets:[]` 断言受全局规则影响会提前失败，不能将它当作 W3 修复或暂存验证通过的证据。

## 未做 / 接棒

- 按卡片停止条件交回 David/Opus：先处理后端接受无重量/无强度处方的契约及回读表示；本任务未修改后端。
- 后续需校准保存测试 fixture、完成真实回读/显示验证、核对 context rail 旧测试，再重跑绿与最终检查。
- 未做浏览器/真机验收或独立终审；没有宣称功能完成。
- 未启动、停止或重启 5180 Vite。未 commit、push、merge；全部改动留工作树。
