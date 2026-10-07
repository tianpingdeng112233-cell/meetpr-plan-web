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
