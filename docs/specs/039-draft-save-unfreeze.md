# SPEC 039 — 草稿保存解冻 + 草稿远端快照（P0 数据丢失修复）

- **Status: Approved**（David 2026-09-01 grill 拍板：1B 2B 3A 4A 5A）
- **级别**: T2（单仓 plan-web；无后端改动、无迁移）
- **优先级**: **P0** — 修好后立即随 web swap 流程部署 staging，不等班车
- **来源**: 2026-08-31 P0 排障。复现结论：任何一行「绑定了动作但组/次/强度/重量没填全」
  会让 `reconcile.ts` `desiredEntries` 抛 `PLAN_SET_SPEC_INCOMPLETE`，**整份草稿从此
  一次都存不进服务器**（autosave / 手动保存 / 发布前 saveNow 全部失败，网络上零请求）；
  UI 仅顶栏小芯片提示，状态栏曾报「已自动保存」。教练点「发布给学员」被预检 alert 拦下，
  关页后服务器草稿为空，只剩同浏览器 localStorage 镜像可救 → 换设备即永久丢失。
  即用户报告的「点了发布 → 没发布成功、也没保存成功」。

## 0. 排障已核实的环境事实（实装前不必复查，但别违反）

- 后端草稿**接受零组动作**：`POST /plans/:id/days/batch` 带 `sets: []` 实测 200。
  发布门禁（`PLAN_PUBLISH_INCOMPLETE`，计 `empty_exercise_count`）只在 publish 时拒。
- 后端**拒绝**缺强度/重量值的 set：`load_mode: null` + `target_weight: null` 实测 422
  `target_weight is required for this load_mode`；`target_reps` 必填。→ 半填数字
  **不能**走计划树上云，只能走快照层。
- 后端已有 **pending-revision 快照层**（backend spec 044，`plan_pending_revisions`
  JSONB 整份快照，`PUT/DELETE /plans/:id/pending-revision`）：draft 与 published
  均可写，仅 completed/paused 409。前端 `remoteMirror.ts` 已封装（退避/重试/keepalive
  齐全），但目前**只在 published 计划上 `schedule()`**（`PlanEditor.tsx` 约 L635
  `if (published)` 分支）——草稿正是缺口。

## 1. 目标与非目标

### 1.1 目标（三件事，同一模块一卡交付）

1. **解冻保存**：不完整行不再整体拒绝保存。完整行照存；「绑定但待填全」的行降级为
   **零组占位**（`{exercise_id, is_main_lift, notes, sets: []}`）写入计划树。
2. **草稿远端快照**：`remoteWriter.schedule()` 对草稿也启用——整份编辑器快照
   （含半填数字、未绑定行）随编辑防抖上云。加载草稿时若快照比计划树新，
   **静默自动恢复**，不弹横幅。
3. **口径诚实**：保存成功但存在降级行时，状态栏改为
   「已自动保存 · N 个动作待填全（内容已云端暂存）」（手动保存同理，动词随 saveMode）。

### 1.2 非目标

- **不动后端**：不改 schema、不放宽草稿 set 校验、不加端点。
- **不动发布门禁**：`handlePublish` 预检（noSets 阻断 alert、unbound confirm）与
  后端 `PLAN_PUBLISH_INCOMPLETE` 全部照旧。零组占位天然被后端 publish 门禁挡住。
- **不动未绑定行的保存语义**：仍跳过 + confirm/状态栏提醒（skippedRows 口径不变）；
  本 spec 靠快照兜底其内容，不把它写进计划树（无 exercise_id 可写）。
- **不动已发布计划**的远端镜像 / publishedDirty / 恢复横幅既有流程。
- 不做多端并发编辑的合并 UI；冲突按 §2.3 规则单向裁决。

## 2. 行为规范

### 2.1 保存降级（reconcile 层）

- 删除 `desiredEntries` 中 `isBoundNoSets` 的 `throw new ReconciliationError('PLAN_SET_SPEC_INCOMPLETE')`
  （`reconcile.ts:306` 附近）。该行改为产出零组占位 desired：保留 exercise_id/主辅/备注，
  `sets: []`。**半填的组/次/强度数字不得写进计划树**（后端会 422，见 §0）——它们只活在
  快照与本地镜像里。
- 「有组次但强度/重量值缺失或无效」的行（`getBoundRowInputIssue` 判定为 issue 且
  `rowToDesired` 无法产出后端可接受的 set）：同样降级为零组占位，**而不是静默跳过**。
  注意与现存「未绑定行跳过计数」区分：降级行**不计入** skippedRows，另计
  `degradedRows` 供状态栏使用（`SaveResult` 加字段）。
- 圆桌回程：服务器零组动作 → 编辑器映射为「绑定、无组数」的行（`assertSupportedServerTree`
  已容忍 `sets.length === 0`，勿破坏）。**必须保证降级行保存→回读不churn**：回读内容与
  快照恢复叠加后不得触发新的 dirty 循环。
- `ReconciliationError` 的 `PLAN_SET_SPEC_INCOMPLETE` 分支若再无抛出点，连同
  `applySaveFailure`/persistRef 里对应错误文案一起清理；`PLAN_REQUIRES_NATIVE_EDITOR` 保留。

### 2.2 草稿快照上云（remoteMirror 扩展）

- `PlanEditor` 内容变更 effect（约 L635）：`remoteWriter.schedule(content)` 不再以
  `published` 为前置——草稿同样调度。`publishedDirty` 等 published 专属状态不受草稿路径影响。
- 快照生命周期：树保存**完整覆盖**内容时（`skippedRows === 0 && degradedRows === 0`，
  即现有 `markMirrorCovered` 的条件）调用 `remoteWriter.markCovered(contentHash)` /
  清除；存在降级或跳过行时快照保持存活。beforeunload keepalive 沿用现有单钩子。
- 限流友好：沿用 `REMOTE_MIRROR_DELAY`（3s 防抖）与现有退避；不得在每击键 PUT。

### 2.3 草稿加载与静默恢复

- 打开草稿时读取快照（`GET /plans/:id` 已回 `pending_revision_saved_at`；内容经现有
  pendingRevision API 读取）。裁决规则：
  - 快照 content_hash 与「服务器树投影出的编辑器内容」hash 一致 → 丢弃快照（DELETE），照常。
  - 快照更新（`saved_at` > 树 `updated_at`）→ **静默应用快照**为当前编辑器内容，
    不弹横幅；随即按正常 dirty 流程走（该内容会再度触发保存/快照）。
  - 树更新（另一设备已完整保存过）→ 树胜，DELETE 过期快照。
- **本地 localStorage 镜像保留**作最后兜底（网络断时快照 PUT 失败 → `local-only`），
  其恢复横幅仅在「本地镜像比快照与树都新」的残余场景出现；草稿的常规路径不应再见横幅。

### 2.4 状态栏口径

- `strings-editor.ts` 新增：`degradedSaved(base: string, n: number)` →
  `「{base} · {n} 个动作待填全（内容已云端暂存）」`；autosave/手动保存共用。
- 快照 PUT 失败退化为 local-only 时，尾注改「（内容已本地暂存）」——不得谎称云端。
- ⚠ 芯片文案「（无法保存）」已不再成立，改「（未填全的行暂存为占位）」或同义，
  定位循环行为不变。

## 3. 测试 seam（先红后绿；复用既有 seam，取最高层）

1. **reconcile 单测 seam**（复用 `reconcile` 现有单测形态，mock server tree + api）：
   - 红：含「绑定+无组数」行与「12×5 无强度无重量」行的 weeks 调 reconcile → 现状抛
     `PLAN_SET_SPEC_INCOMPLETE`；绿：不抛，batch payload 里两行均为 `sets: []` 占位、
     完整行照常、`degradedRows === 2`、skippedRows 口径不变。
2. **PlanEditor UI seam**（复用 `draftMirror-ui.test.tsx` / `autosave.test.ts` 形态）：
   - 红：草稿含降级行时 onSave 从未被调用（保存冻结）；绿：onSave 被调用且状态栏出现
     「已自动保存 · 2 个动作待填全（内容已云端暂存）」。
   - 绿：同场景下 remote mirror `put` 被调度（草稿路径），树完整保存后 `markCovered`。
3. **remoteMirror/恢复 seam**（复用 `remoteMirror.test.ts`）：
   - 快照新于树 → 编辑器内容 = 快照内容且无横幅；树新于快照 → DELETE 被调用、树内容胜。
4. 全量 `npm test` + `npm run build` 绿；手工验收走 §5。

## 4. Out of Scope

- 后端任何改动（含 TRUST_PROXY / 限流共享桶——另卡已挂）。
- 未绑定行写入计划树、发布门禁语义变化、已发布计划编辑流。
- iOS 端适配。**风险登记**：解冻后草稿树中零组占位动作会常态出现；backend 本就接受、
  web 自身 `assertSupportedServerTree` 容忍，但 iOS 教练端若拉取 web 草稿需确认渲染
  不炸——验收时用 iOS 模拟器开同一草稿看一眼，异常则单开 T1 卡，不在本卡修。
- 多端并发编辑合并 UI。

## 5. 验收标准

1. 真实编辑器（staging）复刻排障场景：填「动作+12×5、固定重量不填 kg」→ 3s 内网络出现
   batch 写与 pending-revision PUT；`GET /plans/:id` 树含该动作零组占位。
2. 刷新页面：行回来（含半填数字），**无恢复横幅**；换浏览器/清 localStorage 再登录：行仍在。
3. 点「发布给学员」：预检 alert 照旧拦截；补全强度后发布成功，学员端可见。
4. 完整行照存回归：无降级行时保存/发布/已发布计划更新流程与现状逐位一致（现有测试套全绿）。
5. 状态栏在降级场景显示新口径；快照 PUT 断网时显示本地暂存口径。

## 6. 交付与部署

- 单卡交付（同 plan-editor 模块连续改动）；PR 合 main 后按现有 web swap 流程立即
  重出 backend 镜像部署 staging（P0，不等班车）；部署后按 §5.1-5.3 在线上复走验收。
- commit message 须写明根因假设（保存冻结）与本 spec 号。
