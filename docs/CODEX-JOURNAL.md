# CODEX JOURNAL

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
