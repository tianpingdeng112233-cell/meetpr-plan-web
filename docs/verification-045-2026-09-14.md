# PR #101 / spec 045 验证 — 2026-09-14

## 范围和状态

已批准的教练后移入口与撤销流程；对照 backend #276 的 POST/DELETE/GET 契约。基础提交 `317c723` 已包含 main `04ae976`。本次返修提交 `f452933`，完成定向返修和本地验证，尚未合并或部署；上线依赖 backend 0070、新镜像全量 rollout 和 `COACH_PLAN_SHIFT_ENABLED=true`。

## 返修

- 只读或非 published 计划隐藏并阻止后移/撤销；并发撤销仅发送一次 DELETE。
- DELETE 成功而 GET 失败后，重试只刷新，避免误撤前一批。
- 后移及撤销投射到处方 undo/redo；日程变化本身不成为处方历史。
- 已发布镜像恢复只恢复处方内容，保留权威周日形状、身份、完成信息和推荐日期。
- reconcile 成功、保存期间继续编辑、locked/409 回填统一同步服务端日程与 day ID，保留当前处方输入。
- 草稿保存期间保留日期撤销；发布成功后用最终保存基线统一当前和两套历史的周日形状、日期、ID 与起始日。发布后撤销仍能恢复处方，但不会把后移锚点退回旧日期。

上述边界均有实际失败再通过的回归。覆盖一周/两周镜像恢复、发布后多次撤销/重做、后移预览锚点与再次保存传递的身份。

## 验证

- 最终 Vitest：85 文件、790 测试通过（`--no-file-parallelism`）。
- `npm run build`（含 TypeScript 检查）通过；`git diff --check` 通过。仅既有 bundle 大小提示。
- Standards 与 Spec 分开独立复审，最终两轴均 CLEAN；所有已报告问题已定向返修。完整审查汇总在 CodexConfig 的同日收货记录。
- 本机最终日志：`/Users/david/Projects/apps/meetpr-plan-web-wt-045/qa-045.local/tests-final.log`，真实 red/green 入口记录见同目录 README。
- 浏览器以真实 PlanEditor + 内存 API 边界验证选中天→预览 K=2/J=1→后移两天→日期/徽标/芯片更新。预览与成功截图在同一本机 QA 目录。撤销确认后的浏览器操作受 CUA 限制未完成，由 React 交互测试覆盖。
- 没有使用真实账号或写线上计划；没有把 mock 验证视为后端已上线或 APNs 已投递。

## 线上剩余步骤

先解锁 GitHub billing，使 backend hosted CI 能实际运行；完成真实 RDS 版本/备份/0070、新镜像全量 rollout、开后移 gate，再合并本 PR 并执行 backend 同源 web swap。最后验证三端刷新、后移/撤销和实际 APNs。当前阿里云控制台未登录；本次没有执行上述线上动作。
