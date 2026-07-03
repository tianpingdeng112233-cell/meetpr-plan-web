# CLAUDE.md — meetpr-plan-web 协作须知

给在本仓库干活的 agent（Claude / Codex）看。产品定位、栈、Quick start 见 [`README.md`](README.md)，这里只记**容易踩雷、光看代码看不出来**的东西。

---

## ① ⚠️ 分支现状警告：repo 处于「双血脉」状态

**GitHub 默认分支不是生产部署源。** 两条线各自带着对方没有的修复，trunk 归一待 David 拍板。在没归一之前，**动别名表、动分支、做任何跨分支合并前，先停下核实**。

审计时（2026-07-03）实测的两条血脉：

| | GitHub 默认分支 | 生产部署源 |
|---|---|---|
| 分支 | `origin/feat/002-xlsx-import`（`origin/HEAD` 指向它） | `origin/main`（Vercel 实证部署自此 tip） |
| 审计时 tip | `1c37ec9` Drop cross-wired alias (#2) | `3e19e71` Ride through the backend rate limit |
| 别名表条数 | **34** | **46** |
| 独有的东西 | PR #2 删掉了一条串线别名（单腿罗马尼亚硬拉→单腿硬拉） | RDL/罗拉 别名回填（→46 条）、429 退避重试、xlsx binding 修复 |

- 也就是说：**main 有 002 缺的 429 退避 + binding 修复；002 有 main 缺的 PR #2 删别名。** 谁也不是对方的超集，直接 merge 任一方向都会漏或回退。
- 上面的 tip / 条数是**审计快照，会过期**。真要动之前用 `git log --oneline origin/main origin/feat/002-xlsx-import` 复核，别信这张表的绝对值。
- **判断 prod 现在到底跑哪套命名，唯一可靠方法是带 token 实测线上后端**：`GET /exercises`（经站点 `/api/exercises` 代理，或直连 `http://121.40.160.241:3000/exercises`），看动作名实际叫什么，再决定别名该指向谁。别拿本地任一分支的 catalog 当准。

**这条 docs 分支基于 `feat/002-xlsx-import`（GitHub 默认分支）开，纯新增文档零代码改动——归一前别动 `main`。**

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
- 本地 `npm run dev` 也直连真后端（dev server 代理到 `121.40.160.241:3000`），所以用这套账号能在本地跑通登录→写计划→发布全流程。

---

## ④ 已知坑

- **后端全局限流 100 req/min。** 一次 xlsx 导入会 reconcile 成几百个 per-set 写请求，单次导入就能打爆窗口。`src/api/client.ts` 里有 `rawRetrying`：撞 429 时按服务器 `Retry-After` / `RateLimit-Reset` 退避、有上限重试（429 是在 handler 前就被拒的，请求没生效，重试安全）。**这套退避只在 main 血脉里有，feat/002 tip 缺**（见 ①）。
- **reconcile 按天 delete + recreate，非事务。** 发布/更新时 [`src/features/plan-editor/reconcile.ts`](src/features/plan-editor/reconcile.ts) 对每一天先删后建。中途失败（比如正好撞限流且退避耗尽）可能留下**半更新**状态——某些天已删未重建。改这块逻辑时保住这个隐患意识：没有原子回滚。
- **发布门禁 422 `PLAN_PUBLISH_INCOMPLETE`。** 后端拒绝发布「不完整」的计划：含零组动作、或空训练日等。前端目前对这个 422 的 UX 处理不完善（见 ⑤）。
- **未绑定行静默跳过。** 填了动作名/重量但名字后没 ✓（没绑定到 catalog）的行，保存/发布时被跳过、不写入。前端会 `confirm` 提示行数并在状态栏报「N 行未绑定被跳过」，但很容易被忽略——排查「学员看不到某个动作」时先查这个。

---

## ⑤ 待做区

- **发布 422 UX 缺口**：`PLAN_PUBLISH_INCOMPLETE` 目前对教练不够友好——没有精确指出是哪天/哪个动作导致不完整。需要把 422 详情映射到具体格子并高亮。
- **批量写端点**：治本方案是后端提供批量写接口，一把提交整份计划，替掉现在几百个 per-set 请求 + 429 退避的权宜。对应 **spec 009（已 Draft，在 backend 仓）**，落地后 web 侧 reconcile 可大幅简化、限流坑基本消除。
- **trunk 归一**：见 ①，等 David 拍板后把两条血脉合成一条并重设 `origin/HEAD`。
