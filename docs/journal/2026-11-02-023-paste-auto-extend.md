# 023 CARD-B：粘贴超出末尾自动延长

日期：2026-11-02。开发自测交接，未作产品验收或上线放行。

## 基线与范围

- Worktree：`/Users/david/Projects/apps/meetpr-plan-web-wt-023b`。
- 分支：`feat/023b-paste-auto-extend`；HEAD / 开工基线：`c250416`；开工工作区干净。
- 首个命令在当前目录创建、写入并删除临时文件，exit 0。
- 已完整读取 CONTEXT、SPEC、AMEND、CARD-B、CLAUDE 与工程规约；本卡以 [AMEND](../../specs/023-cross-student-paste/AMEND-auto-extend.md) 为正典。
- 未调用真实后端；API 测试使用 mock。未 commit/push，按派工要求交 Opus 收货。

## 改动文件

| 文件 | 改动 |
| --- | --- |
| `src/features/plan-editor/selectionModel.ts` | 多天偏移计算返回所需周数、落位、跳过数；末尾补整周，上限 52，不缩短。 |
| `src/features/plan-editor/PlanEditor.tsx` | 复用 `resizeWeeksForCount`；补周与粘贴同一个 history 条目；已发布提示同时保留延长/跳过与未推送状态；更新成功按返回周数计算快照覆盖。 |
| `src/features/plan-editor/reconcile.ts` | 周数增长时首批携带 `{ plan_weeks, end_date }`，不带 `start_date`；草稿与已发布共用；重试成功也返回已确认日历元数据。 |
| `src/i18n/strings-editor.ts` | 新增 zhEditor/enEditor 延长及超上限提示。 |
| `src/i18n/strings-zh-hant.ts` | 由 `npm run gen:zh-hant` 生成。 |
| `src/features/plan-editor/selectionModel.test.ts` | W3 粘贴三周、52 周上限、空来源与负偏移。 |
| `src/features/plan-editor/multiday-selection-ui.test.tsx` | 草稿自动保存、一次本地撤销、已发布显式更新、打卡日保留、提示可见、上限、取消、只读、首次打开不写入。 |
| `src/features/plan-editor/cross-mount-paste-ui.test.tsx` | 跨挂载多天粘贴按 AMEND 更新为自动延长；其余动作/单天与逐组设置回归保留。 |
| `src/features/plan-editor/reconcile.test.ts` | 首批延长、草稿/已发布有历史、空周延长、跨批、无增长不补丁、响应丢失后重试。 |
| 本 JOURNAL | 开发证据、独立审查、待拍板与验收限制。 |

## 先红后绿证据

测试按 AMEND 三个公开 seam 纵向执行，每个行为先观察失败再实现。

1. `selectionModel.test.ts`：旧实现把 W5 目标跳过，缺 `requiredWeeks: 5`；实现后通过。随后 52 周用例先得到 53 周失败，再加入上限后通过。
2. `multiday-selection-ui.test.tsx`：草稿粘贴后仍只有 4 周，期望 5 周失败；接入空周生成后通过，验证 `onSave` 收到 5 周及正确内容/日期，undo 后收到 4 周。
3. 同 DOM seam：已发布状态仅显示“有未推送修改”，延长提示断言失败；修复优先级后通过。更新成功仍显示未推送修改的新增断言先失败，使用已确认周数覆盖快照后通过。
4. `reconcile.test.ts`：草稿/已发布有历史的新增周请求缺 `plan_patch`，两个用例先失败；首批添加纯延长补丁后通过。
5. 审查返修：模拟 batch 已提交但响应丢失，重试结果缺日历元数据，新增测试先失败；返回 fresh GET 已确认日历后通过，且不重复写入。

## 门禁结果

最终代码版本于 2026-11-02 14:18 本机运行：

- `npm test`：118 个测试文件、1452 个测试全部通过；pinyin 性能用例通过，未改该文件。完整本机日志：`/tmp/023b-npm-test.log`。
- `npx tsc --noEmit`：exit 0。
- `npm run build`：exit 0；保留既有大于 500 kB bundle 提示。本机日志：`/tmp/023b-build.log`。
- `git diff --check`：exit 0。
- `npm run gen:zh-hant`：exit 0，仅新增对应 editor 文案产生 tracked diff。

## 独立审查

按 review-loop 对 `git diff c250416 -- src` 派出两个只读 reviewer，未改工作区。仓内缺少 `docs/agents/issue-tracker.md`，本次使用本地批准 spec 的 review-loop，未声称执行 tracker 工作流；未来启用该流程需 `$setup-matt-pocock-skills`。

- Standards：初审 0 项硬违反、0 项有实质影响的坏味道。
- Spec：初审发现响应丢失重试的元数据遗漏，已补红绿回归并返修；定向复审关闭该 P2，无新增偏差。另有下述 1 项产品待拍板，不能据此宣布完整验收通过。

## 待拍板

**扩周已自动保存或显式更新后，一次 undo 的服务端语义。** AMEND 行为 5 / 验收 2 要求撤回粘贴与补周；同时行为 4 为“只加不减”，Out of Scope 排除缩短，backend 058 的口子也仅许延长。

当前实现：本地一次 undo 恢复原周数和内容；若树尚未写入，可完整撤回这次本地粘贴。若扩周已经写入服务端，当前 reconcile 不缩周，且不遍历本地已移除周，已有非空训练日不会由 `saveBlockPlan` 的空日删除路径删除；因此**刷新后不保证恢复原周数及末周内容**。DOM/onSave 测试只证明本地撤销与提交的快照，不能当作持久撤销证据。

需 David / Opus 定义：已持久化扩周是否允许作为 undo 特例回缩并删除本次新增内容（需后端契约及历史保护），还是把整周撤销限定于写入前、写入后保留周数并定义内容撤销规则。本卡未擅自开放缩周或删除服务端非空日。

## 验收限制与交接

- 尝试启动隔离本地预览：`npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`，失败原文：`Error: listen EPERM: operation not permitted 127.0.0.1:5187`。临时预览文件已删除；本轮无浏览器亲验或截图。
- 无真实 backend 058 联调、刷新持久化亲验、iOS/Android 新周与推送证据。按 CARD-B 交 Opus 收货；上线仍须先部署 backend 058。
- 工具栏周数锁定、开始日修改、后移、单天/动作粘贴规则未改。

## 返修 1

日期：2026-11-03；按 David 已拍板的持久化后撤销规则执行。上节「待拍板」由本节取代，本轮无剩余产品待拍板。

### 正典与现场

- 保留原有全部未提交改动，HEAD 仍为 `c250416`，分支仍为 `feat/023b-paste-auto-extend`；未 merge main，未 commit/push。
- 首个命令在当前目录用 `mktemp` 创建临时文件并 `rm` 删除，exit 0。
- `git fetch origin` 被沙箱拒绝写共享 gitdir：`error: cannot open '/Users/david/Projects/apps/meetpr-plan-web/.git/worktrees/meetpr-plan-web-wt-023b/FETCH_HEAD': Operation not permitted`。
- 临时 bare 仓读取远端也失败：`Failed to connect to 127.0.0.1 port 18083 after 0 ms: Couldn't connect to server`。
- 已成功读取本地 `git show origin/main:specs/023-cross-student-paste/AMEND-auto-extend.md`；ref 为 `a87d73a37db0cceae365e409d21b934e533b2516`（PR #151），内容已包含 11/03 David 拍板的行为 5 与验收 2 / 2b。未声称成功刷新远端。

### 实现与 red → green

1. reconcile：新增草稿已保存扩周的撤销测试，先红（期望带缩周补丁及删除 ID 的 batch，实际无调用）；实现无历史草稿的 `plan_weeks / end_date` 缩回与移除周日 ID 同批删除后绿。模拟 GET 重新映射与粘贴前周数/内容相同。
2. reconcile：新增已发布无历史、已发布有历史、草稿有历史三种保护用例，先红（遗漏末周删除）；先用空周补齐服务端已确认长度，再走既有逐日 reconcile 后绿。断言精确 batch 只有删日、无 `plan_patch`，也不调用 `patchPlan`，原始天/历史保留，返回编辑器内容与模拟 GET 一致。
3. DOM/onSave：草稿等第一次 autosave 完成后 undo，再等第二次 autosave，提交恢复为原周数/内容，重新挂载仍一致。mock 改为模拟真实保存返回独立 weeks 副本；最初 echo 同一引用导致 autosave 抑制标记未消耗的假失败不作为产品缺陷，未为其修改自动保存逻辑。
4. DOM/onSave：已发布更新完成后 undo，先红（期望保留 5 周，实际 4 周）；成功保存时给 undo/redo 历史补空周并投影日程后绿。再次更新仍传 5 周、末周无内容，重新挂载显示一致；首次更新前 undo 仍可完整缩回，redo 可恢复。
5. 自审追加失败边界：更新被 `ReconcileConflict` 拒绝、未持久化时 undo 应完整缩回。先红（期望 2 周、实际 3 周）；仅在成功保存后传入已确认周数，失败路径只投影日程，不固化本地延长，随后绿。

本轮仅追加修改 `reconcile.ts`、`PlanEditor.tsx`、上述两个测试文件与本 JOURNAL；其余前轮改动保留。

### 审查与验证

- 使用 review-loop 本地独立双轴审查（缺少 tracker 配置，不私建）；Standards 初审及失败边界增量复审均 0 项，Spec 最终 0 项未解决偏离。结论为开发自审，非 Opus 产品终审放行。
- 定向回归：`reconcile.test.ts` 99 项 + `multiday-selection-ui.test.tsx` 11 项，共 110 项通过；日志 `/tmp/023b-rework1-targeted.log`。
- 第一轮全量：1455 项通过，仅 pinyin 性能用例 1506ms 超出 1000ms 阈值；按派工只报告、不改该用例。日志 `/tmp/023b-rework1-test.log`。
- 最终全量、类型检查与构建结果见下方追加记录。
- 浏览器预览再试 `npm run dev -- --host 127.0.0.1 --port 5187 --strictPort`，仍失败：`Error: listen EPERM: operation not permitted 127.0.0.1:5187`。无浏览器截图；无真实 backend 058 / 学员端联调。刷新证据为公开 seam 的模拟 GET 与 DOM 重新挂载，不能代替两端实际收货。

最终门禁（含失败更新回归的最终代码）：

- `npm test`：118 文件，1456 项通过 / 1 项失败；唯一失败仍为既有 pinyin 性能阈值（2056.53ms > 1000ms），无功能测试失败。日志 `/tmp/023b-rework1-final-test.log`。
- `npx tsc --noEmit`：exit 0。
- `npm run build`：exit 0；仅既有 bundle >500kB 提示。日志 `/tmp/023b-rework1-final-build.log`。
- `git diff --check`：exit 0（包括 JOURNAL 追加后再次检查）。
- 剩余待拍板：无。真实浏览器/后端/两端 App 验收限制如上，未执行发布或写真实业务数据。
