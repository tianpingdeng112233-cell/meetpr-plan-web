# 037 — 保存顺序与主辅显示顺序一致

- David 直驱 T1/P1 bugfix；base `b09b5a2`（origin/main）。用户截图 W1D4：Web RDL 位于腿弯举之前，App 相反。
- 复现 seam：真实 PlanEditor 的 DOM 与 onSave 公共边界；输入 deadlift / leg-curl(aux) / rdl，显示 deadlift / rdl / leg-curl，更新却输出输入原序。
- 红测试：`npm test -- src/features/plan-editor/week-band-ui.test.tsx -t 'delivers the displayed'`，原实现 expected deadlift/rdl/leg-curl，received deadlift/leg-curl/rdl。
- 假设依次为展示分组未应用到保存、保存链路重新排序、App 二次排序。请求发送前即失败，排除后二者作为此最小复现的原因。reconcile 的 workToBatchDay 按输入顺序生成 sort_order。
- 修复草稿保存（包含发布前 flush）与显式更新的输入顺序。原始 savedWeeks 仍承担并发编辑代际判定；无排序变化时保留引用，避免草稿降级暂存状态时序回归。原始数组不变。
- 范围边界：有 hasLogs 的日子保留原顺序和历史槽位，遵守 spec 004；这类日子旧有的显示分组差异未处理。不写数据库、不迁移、不自动更新现有线上计划。
- 验证：112 个测试文件、1361 个测试全绿；`npm run build`（含 tsc）成功；`git diff --check` 通过。新增草稿 Ctrl+S 和已发布更新两个回归。
- 浏览器：本地 Vite 5198，真实 PlanEditor + 内存保存回调，六动作 fixture。展开后顺序与保存回显同为传统硬拉/RDL/坐姿腿弯举/杠铃臀桥/山羊挺身/哑铃保加利亚深蹲。不是线上端到端验收；未访问学员真实计划。
- 独立 review-loop：Standards CLEAN（引用保留修订后复审 CLEAN）；Spec CLEAN。tracker 未配置，未宣称执行 Matt tracker 工作流。后续配置入口 `$setup-matt-pocock-skills`。
- 状态：代码自测/自审完成；待 PR CI、收货与部署。上线后未打卡计划需教练点更新才会写入一致顺序。
