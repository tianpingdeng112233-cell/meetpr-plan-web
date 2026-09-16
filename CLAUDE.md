# CLAUDE.md — meetpr-plan-web 协作须知

给在本仓库干活的 agent（Claude / Codex）看。产品定位、栈、Quick start 见 [`README.md`](README.md)，这里只记**容易踩雷、光看代码看不出来**的东西。

Codex 接手时按 `~/.codex/AGENTS.md` 与 `~/CodexConfig/docs/engineering-workflow.md` 执行；主代理承接旧 Claude 编排责任，代码收货保留独立 Standards/Spec 审查。分支、数据与部署边界按本仓规则和已批准 spec。

**身份卡（速查 · 坐标；细节见下方分节）**

| 字段 | 值 |
|---|---|
| 路径 / 栈 | `~/Projects/apps/meetpr-plan-web`；React 18 + Vite 5 + TS + Tailwind；`npm run dev` @ 5180 |
| trunk | 默认分支 = `main`（2026-07-04 已归一切换，`origin/HEAD → main`）。`feat/002-xlsx-import` = 死血脉退休中（删除归 **去重波收尾**，别在此删、别动 PR #3） |
| 部署 | 后端**同源** serve，教练访问 `http://121.40.160.241:3000/`（Vercel 方案已弃用）；dev 默认本地后端，见 README |
| 测试账号 | 教练 `+8613900000001` / 学员 吕子豪（详见 ③）；**密码在 Bitwarden，永不入库**；⚠️ 部分早期测试号直写过 prod RDS |
| 主 worktree | 与 dedup / autosave 等波共享 → 动仓前 `git worktree list`，被占则另开独立树 |

---

## ① 分支现状：双血脉已解，归一到 `main`（2026-07-04）

> **✅ 已归一**：`origin/HEAD → main`，`main` 即生产血脉与默认分支。`feat/002-xlsx-import` = 死血脉退休中（删除归**去重波收尾**，别在此删）。下表是归一前（2026-07-03 审计）的历史快照，保留用来解释**为什么 main 是生产血脉**——别再当作待拍板事项。改别名表前仍按下方方法用 token 实测 prod catalog 命名。

归一前实测的两条血脉（历史快照）：

| | GitHub 默认分支 | 生产部署源 |
|---|---|---|
| 分支 | `origin/feat/002-xlsx-import`（`origin/HEAD` 指向它） | `origin/main`（Vercel 实证部署自此 tip） |
| 审计时 tip | `1c37ec9` Drop cross-wired alias (#2) | `3e19e71` Ride through the backend rate limit |
| 别名表条数 | **34** | **46** |
| 独有的东西 | PR #2 删掉了一条串线别名（单腿罗马尼亚硬拉→单腿硬拉） | RDL/罗拉 别名回填（→46 条）、429 退避重试、xlsx binding 修复 |

- 也就是说：**main 有 002 缺的 429 退避 + binding 修复；002 有 main 缺的 PR #2 删别名。** 谁也不是对方的超集，直接 merge 任一方向都会漏或回退。
- 上面的 tip / 条数是**审计快照，会过期**。真要动之前用 `git log --oneline origin/main origin/feat/002-xlsx-import` 复核，别信这张表的绝对值。
- **判断 prod 现在到底跑哪套命名，唯一可靠方法是带 token 实测线上后端**：`GET /exercises`（经站点 `/api/exercises` 代理，或直连 `http://121.40.160.241:3000/exercises`），看动作名实际叫什么，再决定别名该指向谁。别拿本地任一分支的 catalog 当准。

**本 docs 分支已 rebase 到 `main`（归一后）：纯新增文档 + 顶部身份卡，零代码改动；不含 feat/002 的死别名 commit。**

---

## ② 动作别名表副本机制

- 编辑器解析动作名靠 [`src/features/plan-editor/exerciseIndex.ts`](src/features/plan-editor/exerciseIndex.ts) 里的 `ExerciseIndex`：它的**权威动作域是后端 `GET /exercises` 返回的 catalog**（真名 → 动作 id），教练输入先按真名精确匹配。
- 别名表 [`src/data/exercise-aliases.json`](src/data/exercise-aliases.json) 是**辅助层**：把教练习惯写法（`低杆深蹲`、`卧推`）映射到 catalog 里的 canonical 真名（`低杠位深蹲`、`竞技卧推`），再由 canonical 命中 catalog。别名指向的 canonical **必须是后端真实存在的动作名**，否则解析断链、那行绑不上、保存/发布会被跳过。
- 这份 JSON 是**副本**：源头是 iOS CoachKit 的 `Resources/exercise-aliases.json`（spec 043），本仓库从那儿同步。两边应保持一致——改别名表时想清楚是不是也要回同 iOS 侧，别只改一边造成 web 和 App 解析口径漂移。
- 因为「① 双血脉」，这份副本本身在两条分支上就不一致（34 vs 46）。**碰它之前先按 ① 的方法用 token 实测 prod catalog 命名**，确认 canonical 名当前有效，再改。

---

## ③ 测试账号指针

- 教练端：手机号 **+8613900000001**
- 学员端：**吕子豪**
- **密码在 Bitwarden，不入库。** 别把密码写进代码、测试、文档或 commit。
- 本地 `npm run dev` 默认代理到 `http://127.0.0.1:3000`。需要远端联调时显式设置 `MEETPR_DEV_BACKEND_TARGET`，并核对目标环境与测试账号；写请求会落到所选后端。

---

## ④ 已知坑

- **保存有批量路径，仍需处理限流。** [`reconcile.ts`](src/features/plan-editor/reconcile.ts) 对无锁训练日使用 `POST /plans/:id/days/batch`，按有界批次顺序保存；不再把每次导入都拆成几百个 per-set 请求。`src/api/client.ts` 的 `rawRetrying` 仍按 `Retry-After` / `RateLimit-Reset` 对 429 做有上限退避，实际限额以所选后端配置为准。
- **事务边界是一批请求。** 每个 batch 在后端原子执行；跨多个 batch，以及含已打卡动作的混合日逐动作 CRUD，不共享整份计划事务。后续请求失败时前面成功的批次可能已经生效，恢复路径必须以服务端重新读取的树为准。
- **日程以服务端为准。** 已发布计划恢复快照或撤销内容历史，只恢复内容，不回滚 day ID、推荐日期和完成态；保存回包也要刷新这些字段。后移/撤销写成功但随后 GET 失败时，“重试”仅重拉计划，不重复 POST/DELETE。实现与回归入口见 `mapping.ts`、`draftMirror-ui.test.tsx`、`reconcile.test.ts` 和 `plan-shift-ui.test.tsx`；045 上线前置见 [`docs/specs/045-coach-plan-shift.md`](docs/specs/045-coach-plan-shift.md)。
- **发布门禁 422 `PLAN_PUBLISH_INCOMPLETE`。** 后端拒绝发布「不完整」的计划：含零组动作、或空训练日等。前端目前对这个 422 的 UX 处理不完善（见 ⑤）。
- **「≠」行 = 含 App 设定的逐组设置（休息/逐组次数/组备注）。** 网格表达不了这些字段，保存/更新时按行原样透传（`reconcile.ts` opaque 快照）：没改的行逐组原样回写；改过的行以网格为准、休息/备注按组序号保留、逐组不同的次数会被统一。别再引入「整份拒写」（PLAN_REQUIRES_NATIVE_EDITOR 已于 2026-09-02 删除，#99）。
- **未绑定行静默跳过。** 填了动作名/重量但名字后没 ✓（没绑定到 catalog）的行，保存/发布时被跳过、不写入。前端会 `confirm` 提示行数并在状态栏报「N 行未绑定被跳过」，但很容易被忽略——排查「学员看不到某个动作」时先查这个。

---

## ⑤ 待做区

- **发布 422 UX 缺口**：`PLAN_PUBLISH_INCOMPLETE` 目前对教练不够友好——没有精确指出是哪天/哪个动作导致不完整。需要把 422 详情映射到具体格子并高亮。
- **045 发布状态（2026-09-16）**：后端 #276 已部署，0070 与 coach gate=true 已验证；本仓 #102（含 #101/#53）已合并，经 backend #278 部署并核对线上产物和界面。同源产物和线上验收以 [后端部署记录](https://github.com/tianpingdeng112233-cell/MeetPR-backend/blob/staging/docs/deployment-045-web101-53-2026-09-16.md) 为准；本仓 [集成验收](docs/verification-101-53-2026-09-16.md) 记录测试与界面证据。
- ~~**trunk 归一**~~：✅ 已完成（2026-07-04，归一到 `main`，`origin/HEAD → main`）。残留仅 `feat/002-xlsx-import` 分支退休（删除归去重波收尾）。
