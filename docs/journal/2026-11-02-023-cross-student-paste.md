# 023 跨学员 / 跨计划复制粘贴 — 开发记录

- 日期：2026-11-02；worktree：`/Users/david/Projects/apps/meetpr-plan-web-wt-023`；分支：`feat/023-cross-student-paste`。
- HEAD 与 `origin/main` 均为 `f920a90bc58f9b3098a833c069015ca428fabdf6`，已含 022；开工工作区干净。
- 第一条命令 `touch .codex-write-probe && rm .codex-write-probe` 退出 0。全程只修改当前 worktree；没有 add、commit、push、PR 或 Git 元数据绕过操作。
- 已完整读取 `CONTEXT.md`、`specs/023-cross-student-paste/SPEC.md`、`CARD.md`、`CLAUDE.md`，并核对全局工程规约与记忆索引。

## 实现与文件

- `src/features/plan-editor/clipboardStore.ts`：标签页级单份剪贴板，保存 kind、原文本与完整行/相对日偏移；schema version 1，读取校验版本和数据形态。sessionStorage 访问、读写均捕获异常，失败后本次页面生命周期仅用内存，避免旧持久化副本覆盖最新复制。
- `src/features/plan-editor/PlanEditor.tsx`：移除组件内五个 clipboard refs，经 store 复制/读取；复制前与粘贴时仍走既有 cloneRow 路径。opaqueSets、opaqueSetBaseline 保留，源 serverRowId/serverSortOrder/hasLogs 清除；目标锁定行与目标槽位规则不变。
- `src/features/plan-editor/clipboardStore.test.ts`：10 条公开存储 seam 测试。
- `src/features/plan-editor/cross-mount-paste-ui.test.tsx`：9 条 DOM 测试，复制后卸载/换 key 重挂，在 onSave 检查数据。
- 本 JOURNAL。未改 clipboard.ts、PlanWorkspace mount key、后端、App 或依赖；没有新增用户文案，因此无需修改 zhEditor/enEditor 或运行 gen:zh-hant。

## 先红后绿

1. `npm test -- src/features/plan-editor/clipboardStore.test.ts`
   - 第一条读/写/覆盖/重建恢复测试先红：clipboardStore 模块不存在。
   - 加入版本化 sessionStorage 存储后 1/1 绿。
   - 增加 storage access/read/write 三种异常用例，3 红（denied/blocked/quota）；加入内存降级后 4/4 绿。
   - 增加 JSON 损坏、未知版本/类型、错误 rows/offset 五种用例，5 红；解析失败视为空、校验形态后 9/9 绿。再加独立存储区域为空的保护用例，10/10 绿。
2. `npm test -- src/features/plan-editor/cross-mount-paste-ui.test.tsx`
   - 接入 store 前动作/单天/多天三种跨挂载用例全部红：B 的 onSave 中源动作为 undefined。
   - 替换 refs 后三种全部绿；动作选择 fixture 补齐真实 mousedown/up，避免只 click 实际复制整天。
   - 后续保护用例覆盖右键复制、空天/非空锁定天、一次撤销、外部不同文本优先/相同文本保留逐组设置、completed/paused 历史只读。已发布目标粘贴后 onSave 不自动触发，显式保存才收到内容。
3. 定向回归命令：

```sh
npm test -- src/features/plan-editor/clipboardStore.test.ts src/features/plan-editor/cross-mount-paste-ui.test.tsx src/features/plan-editor/locked-ui.test.tsx src/features/plan-editor/multirow-selection-ui.test.tsx src/features/plan-editor/multiday-selection-ui.test.tsx
```

结果：5 文件、52 测试全部通过。动作复制验证主辅分区；多天复制验证相对偏移、超界跳过、一次 undo/redo；opaqueSets 在 onSave 边界保留逐组休息与备注。

## 最终 Gate

| 命令 | 结果 |
| --- | --- |
| `npm test` | 退出 0；118 文件、1436 测试全通过，15.02s；原始日志 `/tmp/023-npm-test.log` |
| `npx tsc --noEmit` | 退出 0 |
| `npm run build` | 退出 0；270 modules，Vite 6.47s；有 >500 kB chunk 提示 |
| `git diff --check` | 退出 0 |

已知 `pinyin.test.ts` 的 `stays bounded on adversarial state-accumulating input` 本次通过，565ms；没有改动、跳过或放宽该用例。全量日志包含既有 jsdom media pause/load 未实现与 Node localstorage-file 提示，未造成失败。

## 独立审查

按 code-review 技能对 HEAD 基线的未提交改动及新增文件分别运行只读 Standards / Spec reviewer。

- Standards：0 硬违反，0 需返修的代码气味。
- Spec：2 项验收限制，见下方待拍板；未发现新粘贴规则回归或范围扩张。
- 仓内缺少 `docs/agents/issue-tracker.md`；本卡直接指定本地 spec，不依赖 tracker，不私建配置。依赖 tracker 的后续流程需 David 调用 `$setup-matt-pocock-skills`。

## 待拍板

1. SPEC「新开的标签页没有」与 CARD 指定 sessionStorage 的覆盖边界：带 opener 新页可能取得来源标签页存储的初始副本；标准定义了 [session storage 的 legacy clone](https://storage.spec.whatwg.org/#legacy-clone-a-traversable-storage-shed)。当前实现按卡使用 sessionStorage，没有额外标签页身份/协调机制，不能据此承诺 opener/浏览器复制标签页都为空。需 Opus/David 明确这些打开方式是否纳入验收及补充实现边界；本次没有自行缩小 SPEC 承诺。普通独立空存储区域测试不代表浏览器继承场景已验。
2. 已发布目标多天超界提示的既有缺口：pasteSelectedDay 写入跳过计数，但 PlanEditor 的 visibleStatusText 在 publishedDirty 时优先显示本地暂存状态，覆盖计数。已在 DOM 实验观察到；同一条断言在草稿目标得到「已粘贴 2 天,1 天超出计划范围已跳过」。卡要求原粘贴规则/状态栏沿用，本次未改状态优先级。需 Opus/David 决定是否另行修复，不能宣称验收清单 3 对所有已发布目标均满足。

## 尚未验证与交付边界

- 真实浏览器跨学员/同学员跨计划、刷新、各类新标签页、老教练第一屏及 Excel 实贴未亲验；DOM 不替代真实浏览器。刷新恢复仅在重新创建 store 的 seam 验证。
- 已解绑学员只读沿用既有 studentEnded gate；新增 DOM 只验证 completed/paused，未新增解绑专用用例。
- 保存后后端计划树中的逐组数据、已发布显式更新后的两端 App 展示未验证，按 CARD 留 Opus 收货；本次未连接或写入生产。
- 本地工程闸门全绿不等于产品验收通过。代码与本记录均未提交，交 Opus 审查、commit 和开 PR。

## 返修 1

- 2026-11-02，针对 Opus Standards finding 定向返修；保留上一轮全部未提交改动，无 commit/push。
- `clipboardStore.read()` 增加 `memory !== null` 提前返回：当前页面内存副本优先，只有内存为空时才读取 sessionStorage。`write()`、schema version 1、持久化校验和存储异常降级逻辑均未修改；未改 PlanEditor 或粘贴规则。
- 新增公开 write/read seam 回归：写入有效内容后，将持久化内容替换为校验失败的 rows，读取仍应得到原内容。修复前 1 红 / 10 绿（实际返回 null），修复后随定向回归全部转绿。红测试日志：`/tmp/023-rework1-red.log`。
- 原有 5 个坏数据参数用例曾断言同一 store 每次重读存储，现仅将读取改为新建 store，继续验证冷启动遇到坏数据返回 null；其余原有断言未改，包括存储异常时保留最新复制内容。

| 检查 | 结果 |
| --- | --- |
| `npx vitest run src/features/plan-editor/clipboardStore.test.ts src/features/plan-editor/cross-mount-paste-ui.test.tsx src/features/plan-editor/locked-ui.test.tsx src/features/plan-editor/multirow-selection-ui.test.tsx src/features/plan-editor/multiday-selection-ui.test.tsx` | 退出 0；5 文件、53 测试通过；`/tmp/023-rework1-targeted.log` |
| `npm test` | 两次均退出 1；117 文件通过、1 文件失败；1436 测试通过、1 失败。唯一失败为既有 `pinyin.test.ts:53` 性能断言，3167ms / 1445ms 超过 1000ms；第二次未与本轮类型检查或构建并行。日志 `/tmp/023-rework1-npm-test.log`、`/tmp/023-rework1-npm-test-rerun.log` |
| `npx tsc --noEmit` | 退出 0；`/tmp/023-rework1-tsc.log` |
| `npm run build` | 退出 0；保留既有 >500 kB chunk 提示；`/tmp/023-rework1-build.log` |
| `git diff --check` | 退出 0 |

本轮未修改、跳过或放宽拼音性能用例；全量测试闸门未绿，不宣称验收通过。仅追加本返修记录，上一轮浏览器与两端 App 验证限制仍适用。
