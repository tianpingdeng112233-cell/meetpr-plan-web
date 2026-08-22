# 009 — 已发布计划的远端草稿镜像(remote draft mirror)

- **Status**: InProgress
- **拍板**: David 2026-08-22 选 B——已发布计划的编辑内容**自动暂存到服务端**(学员不可见),点「更新计划」才应用;不改 autosave 语义(spec 003/004「已发布计划绝不自动推给学员」不动)。
- **后端契约权威**: MeetPR-backend `specs/044-plan-pending-revision/SPEC.md`(迁移 0068)。端点:`PUT/GET/DELETE /plans/:id/pending-revision`;`GET /students/:id/plans` 与 `GET /plans/:id` coach 分支新增 `pending_revision_saved_at: string | null`。
- **事故背景**: 08-22 教练在已发布计划写了 W7 未点「更新计划」即离开,内容只留在那台浏览器 localStorage(`meetpr.planEditor.draftMirror.<planId>`),服务器 W7 为空,学员端显示「已全部完成」被读成「计划没了」。
- **不做**: 不做多设备实时协同/合并(last-writer-wins + 读取时让教练二选一);不动 draft 计划的 autosave 路径;不改 iOS;不改「更新计划」的 confirm 与 reconcile 逻辑。

## 1. 数据形状(复用,不新造)
- 远端存的就是现有 `DraftMirror`:`{ version: DRAFT_MIRROR_VERSION, content: DraftMirrorContent, contentHash, savedAt }` → PUT body `{ version, content_hash, content }`;GET 回来后走**同一套** `parseMirror` 校验(version/hash/isContent),校验不过视为无远端镜像并 DELETE 之。
- 新增 `src/api/pendingRevision.ts`:`getPendingRevision(planId)`(404 → null)、`putPendingRevision(planId, mirror)`、`deletePendingRevision(planId)`;`PlanResponse`/`PlanWithChildren` 类型加 `pending_revision_saved_at?: string | null`(可选,兼容旧后端)。

## 2. 写路径(仅 published 且非 readOnly)
- 在 `PlanEditor` 现有 `createDraftMirrorWriter` 之外增加一个**远端写入器** `createRemoteMirrorWriter`(放 `draftMirror.ts` 或新文件 `remoteMirror.ts`):防抖 **3000 ms**(比本地 800 ms 慢,减少请求;全局限流 100/分/IP 仍留余量),失败静默 + 指数退避重试(最多 3 次,429 按 `Retry-After`/默认 5 s),页面 `beforeunload` 时 `flush()`(用 `fetch(..., { keepalive: true })`)。
- 触发条件与本地 mirror 完全一致:内容 hash ≠ `serverMirrorHash` 时 schedule;回到基线(undo 到与服务器一致)时 cancel + `deletePendingRevision`。
- draft 计划**不**走远端写入(autosave 已直接落库)。
- 成功写入后把 `savedAt` 暴露给顶栏(见 §4)。

## 3. 读路径(mount 时)
- 打开一份 published 计划:并行读本地 mirror(现有)与远端 `getPendingRevision`。候选 = 两者中 `contentHash ≠ serverMirrorHash` 的那些;若都有且 hash 不同,取 `savedAt` 较新者为候选,另一份在 banner 里提供「查看另一份(较旧,来自{本设备|其他设备})」不做合并——先上最简单:**只取较新者**,较旧者在教练点「恢复」或「丢弃」后一并清掉(本地 clear + 远端 DELETE)。
- banner(`DraftMirrorBanner`)文案区分来源:本地 → 现有「本地草稿」;远端 → 新增 `remoteDraft: '云端暂存'` / `unsavedRemoteDraft(time)`:「检测到 {time} 在其他设备/会话暂存的未推送修改」;i18n 两语都补(`strings-editor.ts` zh/en)。
- 「恢复」→ 现有 `restoreDraftMirror` 逻辑(内容进编辑器、成为当前草稿、本地 mirror 同步写);「丢弃」→ 本地 clear + 远端 DELETE。

## 4. 「有未推送改动」可见性(这次事故的直接修复)
- `TopBar` 的 statusText 已有 `publishedDirty(student)`;改为**醒目态**:已发布且 dirty 时,状态 pill 用 `--warn` 底色 + 粗体,文案 `publishedDirtyStashed(student, time)`:「已发布给 {student} · 有未推送修改(已暂存 {HH:MM})」;远端写入尚未成功时显示「(暂存中…)」,失败 3 次后「(仅本机暂存)」。
- 「更新计划」按钮在 dirty 时加强调样式(border `--warn`),不改位置、不改文案。
- 计划下拉(`PlanWorkspace.planOpts`)每行若 `pending_revision_saved_at` 非空,tag 追加「· 有未推送修改」(新增 `S.common.pendingChanges`)。
- 「更新计划」成功(`markMirrorCovered` 被调用处)→ 远端 `deletePendingRevision`(失败静默,下一次 mount 时 hash == 基线会被自动清)。
- 离页守卫(`leavePublishedDirtyConfirm`)保留,但文案改为「这份已发布计划还有未推送给学员的修改(已暂存到云端,下次打开可恢复)。仍要离开吗?」;若远端暂存尚未成功则沿用旧文案「离开后会丢失」。

## 5. 兼容
- 后端还没上 044 时:`getPendingRevision` 404/405 → 当作无远端;PUT 失败静默;列表缺字段按 null。功能退化为现状,不报错。
- `clearAllDraftMirrors`(登出)不动远端(远端归账号,不归浏览器)。

## 6. 测试(vitest)
1. `remoteMirror.test.ts`:防抖合并、失败退避、回到基线时 DELETE、beforeunload flush。
2. `PlanEditor` mount 解析:本地/远端二选一取较新;hash == 基线的候选被忽略并清理;损坏远端被 DELETE。
3. 顶栏:published+dirty → warn pill 文案含暂存时间;更新成功后恢复普通态并触发 DELETE。
4. `npm run build`(tsc --noEmit + vite build)与现有测试全绿。

## 7. 验收(David)
- 浏览器 A 打开倪嘉骏已发布计划,改 W7 不点更新,关页;浏览器 B(或无痕)打开同计划 → 出现「云端暂存」banner,恢复后点「更新计划」→ 学员端出现 W7;下拉与顶栏标记随之消失。
- 学员 token 调 `GET /plans/:id` 看不到 `pending_revision_saved_at`;iOS 行为不变。
