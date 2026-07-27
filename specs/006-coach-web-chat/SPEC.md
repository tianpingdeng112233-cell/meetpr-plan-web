# spec 006 · 教练网页端 1:1 聊天（W1：读 + 发文本）

> 仓库：`/Users/david/Projects/apps/meetpr-plan-web`（教练网页端 plan-web）
> 后端对手方：`MeetPR-backend-chat` spec 024（PR #92 已合 staging 并部署，`/conversations` 五条路由在线）
> iOS 对手方：`MeetPR-release` spec 058（已合 `release/1.0`，1.0(14) 候选）
> 分级：T2（跨模块新面 + 新轮询范式）｜发布节奏：P1（随下一班车）｜**后端零改动**

---

## 1. 目标与非目标

### 1.1 目标（W1 必须做到）

教练在 plan-web 工作台里能：

1. 在左侧 rail 上看到「消息」tab，tab 上有未读红点，**红点在任意 tab 下都随轮询更新**（不必进消息 tab 才发现有人找）。
2. 进消息 tab 看到会话列表：对方姓名、最后一条消息预览、相对时间、每条会话的未读红点。
3. 点开任一会话看到完整消息流（含学员在 iOS 上发的图片消息，只渲染不上传），可向上翻历史。
4. 在输入框写中文文本并发送（**中文输入法候选态按 Enter 不会误发**），发送中/发送失败/重试三态可见，失败重试不产生重复消息。
5. 看到「已送达 / 已读」回执（仅挂在我发的最后一条上）。
6. 主动对某个学员发起对话（学员从未开口时也能先说话）。
7. 教练**确实在看**这个会话时（页面可见 + 窗口有焦点 + 近 2 分钟内有交互），已读回执与未读数与服务端一致；教练离席时**不替他的手机清红点**。

### 1.2 非目标（W1 明确不做，别顺手做）

| 不做 | 理由 |
|---|---|
| 图片**上传**（`/uploads/initiate` 多段流程、降采样、孤儿清理） | 已拍板 defer 到 W2；只渲染已有 image 消息 |
| 自动链接化 / markdown / 富文本 | 后端 `helmet` 的 CSP 是关的（`src/app.ts:35-36`）且 plan-web 与后端同源托管，做链接化等于自己拆掉唯一一层兜底；两端目前都没有 |
| URL 路由（把 tab 同步进 hash/query） | 全局架构改动，超出单 tab 范围；刷新回 `editor` 是全站既有行为，本卡不改 |
| 跨标签页协调（storage 事件、leader election） | 见 §6.4，本卡登记为已知限制 |
| 全局 401 → 回登录页的兜底通道 | 是**已发布** plan-web 就存在的洞（autosave 永久失败、60s 轮询吞 401），另开一张 T1 卡；本卡只做聊天侧自保（§6.1） |
| 教练侧「前教练死会话」的后端过滤 / wire 加 `is_active` | 后端零改动已拍板；前端用 §6.2 的双闸兜住 |
| 移动端窄屏适配（<900px） | plan-web 全站最低断点就是 900px，rail + 编辑器在 390px 本来就不可用；聊天单独适配没有意义，等全局窄屏决策 |
| **从学员上下文（看板 / 编辑器 / 视频）一键发消息** | 需要跨 tab 跳转 + 把 `studentId` 语义搬进消息 tab，是独立的一块导航设计；W1 的唯一入口是消息 tab 内的「＋ 发起对话」下拉（§3.6），它同时兼作按姓名定位会话的手段。登记进 §10 |
| **会话列表搜索 / 分组 / 过滤** | 内测教练学员数是个位数到 20 出头，一屏能扫完；按姓名定位由 §3.6 的下拉承担（选中已有会话的学员直接打开该会话）。等会话数真的过 30 再做 |
| 组卡片（把训练卡片作为消息发出去） | 本卡是它的前置；只要求消息渲染对未知 `kind` **前向兼容**（§5 第 10 条） |
| 桌面通知 / 声音提示 | W2 APNs 之后再议 |

---

## 2. 现状与可复用件

### 2.1 plan-web 现状（全部以 `origin/main` 为准，已逐条实读复核）

- **没有路由库**：`src/App.tsx` 用 `useState` 切视图，依赖只有 `react` / `react-dom` / `xlsx`。
- **顶层按角色分流**：`App.tsx` → `role === 'admin'` 进 `AdminWorkspace`，`role === 'coach'` 进 `PlanWorkspace`。**消息 tab 只能加在 `CoachRail`**——后端 `conversations/index.ts:309` 是 `requireRole('coach','coached_student')`，admin 一律 403。
- **`App.tsx` 手上就有 `AuthUser`**：`PlanWorkspace` 的渲染分支写在 `if (view === 'workspace' && user)` 里，`user` 在该处已被 TS 收窄成非 null，`me` 直接当 prop 传下去即可（`PlanWorkspace` 现有 props 只有 `onLogout`，它自己拿不到 user）。
- **教练端状态全部 hoist 在 `PlanWorkspace` 的本地 `useState`**，无 Redux/Context，子页面一律 props 下传。
- **tab 注册表**：`src/features/workspace/CoachRail.tsx:1` 的 `CoachView` 联合类型 + `:3-9` 的 `tabs` 数组（icon 是纯字符 glyph，不是 SVG）。
- **红点 badge 目前硬编码只服务 requests**：`CoachRail.tsx:11` 组件签名是 `pending: number`，`:16` 渲染条件是 `tab.id === 'requests' && pending > 0`。**必须先泛化**。
- **两处独立 shell**：`PlanWorkspace.tsx:315` 起是「教练零学员」空态（整支 `return`，里面单独列了 editor/catalog/requests 分支，board/videos 在 `:343` 降级成 `.empty-page` 文案），`:361` 起是正常态。**加 tab 必须两处都加，否则新教练点它白屏**（`072866a` 加动作库 tab 时就是两处都加）。
- **boot effect 只拉四样**：`listExercises` / `getExerciseUsageStats` / `getCoachStudents` / `getBindRequests`（Promise.all），随后 `if (st.length > 0) await loadStudent(...)`。**它不拉 conversations**——这是 §4.2 首屏缺口的根因。
- **换 tab 不能直接 `setView`**：走 `PlanWorkspace.tsx:274` 的 `changeView` → `coachViewNavigation.ts::navigateCoachView`（离开 editor 先跑 leave guard 冲刷草稿，回 editor 先刷新服务端快照，中间有 `viewTransitioning` 锁 + `inert` 遮罩）。
- **全仓唯一的定时轮询**：`PlanWorkspace.tsx:145-148`，60 秒 `setInterval` 拉一次 `getBindRequests()`，`catch(() => undefined)` 吞一切错。**没有 visibilitychange 暂停、没有重入闸、没有 focus 立即刷新。**
- **API client**：`src/api/client.ts` 单文件 fetch 包装——`BASE` 模块加载时算一次、Bearer 注入、`rawRetrying` 对 429 按 `Retry-After` 退避（`MAX_RATE_LIMIT_RETRIES = 6`，每次 `Math.min(wait, 60_000)` → **单个请求最长可在飞约 6 分钟**）、401 单飞刷新一次后重放、导出 `api.get/post/patch/del` 与 `ApiException(status, code, details)`。
- **⚠️ `crypto.randomUUID` 在生产上不存在**：plan-web 与后端同源部署在 `http://121.40.160.241:3000`（FORCE_HTTPS 仍关），IP + 明文 HTTP 不是 secure context，`crypto.randomUUID` 是 `undefined`；而 vitest/jsdom 与 Node 都提供它，**测试全绿、线上必炸**。全仓 `origin/main` 对 `crypto.` 零命中，没有既有先例背书。`crypto.getRandomValues` 不受 secure-context 限制，可用。
- **CSS 继承链**：`index.css:99` `.data-page { height:100%; overflow:auto }`，`index.css:91` `.coach-main { min-width:0; flex:1; height:100%; overflow:hidden }`。超宽/超高内容是**静默裁切**（页面不会长出横向滚动条，用户也滚不回来）。
- **IME 先例已在仓里**：`src/features/plan-editor/components/DayColumn.tsx` 的 `GuardedInput` 用 `composing` ref + `onCompositionStart/End`，注释写明「Mid-composition the controlled value must track the IME text verbatim」。
- **`isSessionExpired` 有测试依赖**：`ChangePasswordDialog.tsx:81` 导出它，`ChangePasswordDialog.test.ts:3` import 它并在 `:46/:50/:51` 断言。删掉这个 export 而不改测试，`tsc --noEmit` 与 `npm test` 双挂。
- **lint 就是 `tsc --noEmit`**，没有 ESLint；`npm run build` 已串类型检查；**本仓没有任何 CI**（无 `.github/`），只能本地跑 `npm run lint && npm test`。

### 2.2 直接可复用件（照抄，别重造）

| 用途 | 复用什么 |
|---|---|
| 鉴权 / 退避 / 刷新 | `src/api/client.ts` 的 `api.get/post`，聊天层零鉴权代码 |
| 一行一函数的薄 API 封装风格 | `src/api/coach.ts`（含 `.then(r => r.bind_requests)` 的解包习惯） |
| 页面骨架 | `src/features/workspace/VideosPage.tsx` 的 `<main className="data-page">` + `PageTop`；状态条文案抄 `RequestsPage.tsx` 的 `● N 待处理 · 60s 自动刷新` |
| 「列表 → 下钻」双层页 | `src/features/workspace/StatsViews.tsx::StudentBoard`（本地 `detailId` 切换列表/详情）；返回按钮复用 `.page-back` 类 |
| 行样式 | `index.css:134` 的 `.request-row / .avatar / .request-who`（圆头像 + 主次两行 + 70px 行高）就是会话行的形状，但**新写 `.chat-*` 类**，别改既有类 |
| rail 样式 | `index.css:92-98` 的 `.coach-shell/.coach-rail/.coach-rail-tab/.coach-rail-badge` 已通用，新 tab 不需要写 rail CSS |
| **中文输入法守卫** | `DayColumn.tsx::GuardedInput` 的 composing ref 范式（§3.5 照抄） |
| **「本地 draft + 事件时 commit」** | 同文件 `SetsInput`：composer 草稿用同一形状（每键只重渲 composer，失焦/切会话才上抛） |
| 请求代际防串 | `VideosPage.tsx` 的 `videosRequest/urlRequest` ref 计数器；`PlanWorkspace.tsx` 的 `loadGeneration` |
| 单飞 + 失败保 dirty | `src/features/plan-editor/autosave.ts::createSaveController`（发送队列的形状底本） |
| 测试范式 | `src/features/catalog/CatalogPage.test.tsx`（`IS_REACT_ACT_ENVIRONMENT` + `createRoot`/`act` + `vi.mock` API 模块） |
| iOS 语义的可执行建模 | `MeetPR-release/Modules/ChatUI/Sources/ChatUI/InMemoryChatRepository.swift` 可当 mock 夹具的翻译底本；`Tests/ChatUITests/` 四个用例（轮询方向 / pending 对账 / 红点复活 / 图片续签）可 1:1 翻成 TS 测试 |
| 中文文案正典 | `MeetPR-release/Modules/ChatUI/Sources/ChatUI/Resources/Localizable.xcstrings`（17 条 zh-Hans，逐字取用） |
| 相对时间分档 | `MeetPR-release/Modules/ChatUI/Sources/ChatUI/ChatRelativeTime.swift`（逐行移植成 TS，阈值与文案照抄） |

### 2.3 后端契约速查（无需再读后端源码）

所有路径均在 `/conversations` 前缀下，全为 snake_case wire。

```
POST /conversations              body {other_user_id}          → 201/200 {conversation}
GET  /conversations                                            → 200 {conversations:[…]}  无分页，last_message_at DESC NULLS LAST, id DESC
GET  /conversations/:id/messages ?since_seq|before_seq|limit   → 200 {messages, meta:{other_last_read, has_more}}
POST /conversations/:id/messages body {kind:'text',body,client_id} → 201/200 {message}
POST /conversations/:id/read     body {message_id}             → 200 {my_last_read:{message_id,seq}, unread_count}
```

- `since_seq=n` → `seq > n` **ASC**（最早的下一批）；`before_seq=n` → `seq < n` **DESC**；不带游标 → 最新一页 **DESC**。**三种方向不同，渲染前一律自己按 seq 排。**
- `limit` 默认 30、上限 100；`since_seq` 与 `before_seq` 同传 → 400。
- `has_more` = 「本方向还有没有」，靠多取一条实现。**不是「有没有新消息」。**
- `seq` 是会话内从 1 起的整数（JSON number），既是排序键也是唯一游标；没有时间戳游标。
- 幂等键 `(conversation_id, sender_id, client_id)`，同 `client_id` 重发直接回既有消息（**不校验 payload**）。`client_id` 长度 1..64，**无格式要求**（不必是 UUID）。
- 已读游标 `GREATEST` 单调不回退，返回的是**落库后的实际游标**——以响应为准覆盖本地，别假设等于自己发的那条。
- `unread_count` = 本会话中 `sender_id != 我` 且 `seq > 我的 last_read_seq` 的条数。
- `preview` 对 image 消息固定是服务端写死的 `"[图片]"`，**前端不要再本地化一次**。
- `image_url` 是每次请求现签的 OSS URL，`image_expires_in = 900`；OSS 未配置时恒为 `null`。**不得改用 `GET /uploads/:id/url` 读对端图片**（chat_image 仅 owner，非 owner 恒 404）。
- `other_party.display_name` 缺 profile 时是**空字符串**不是 null，要兜底。
- 校验顺序是 **params → 成员校验(404) → body/query 校验(400)**。
- **`403 CHAT_BIND_REQUIRED` 有两个产地**：`POST /conversations`（`canonicalPairMatches` 失败，`conversations/index.ts:329-360`）与 `POST /:id/messages`。前者发生时**手上还没有 conversationId**，必须单独有一条 UI 出口（§6.2）。
- 错误码全集：`401 AUTH_INVALID_TOKEN` / `403 AUTHORIZATION_FORBIDDEN` / `403 CHAT_BIND_REQUIRED` / `404 CONVERSATION_NOT_FOUND` / `400 CHAT_INVALID_ATTACHMENT` / `400 CHAT_INVALID_CURSOR` / `400 VALIDATION_ERROR` / **`409 CHAT_SEQUENCE_CONFLICT`（SPEC 里没写、无测试覆盖，必须显式处理）** / `429 {"error":"rate_limited"}` / `500 internal_error`。
- 全局限流 per-IP **100 req/60s**，`/conversations` **无豁免**；被 429 拒绝的请求**仍然计数**（`skipFailedRequests: false`），所以一个不退让的轮询器会持续偷走恢复中的预算。
- **服务端成本**：`GET /conversations` 无分页，每条会话 5 次 DB 查询（`Promise.all(rows.map(fetchConversationWire))`）。侦察档案给的建议是列表轮询 **≥30s**——这是 §4.2 定 30s 而不是 15s 的直接依据。
- `GET /coach/students` 同样没有 canonical 收敛（`coach-students.ts:33-54` 只筛 `br.coach_id = me AND br.status='accepted'`），前学员照样在花名册里。

---

## 3. UI 结构

### 3.1 tab 位置

`CoachRail` 的 `tabs` 数组**追加在末尾**（`requests` 之后）：

```ts
{ id: 'messages', icon: '✉', label: '消息' }
```

理由：既有五个 tab 的顺序与像素位置零变动，教练肌肉记忆不受损；发现路径靠红点承担。（是否上移到第二位列入 §10 待拍板，本卡先按末尾实装。）

`CoachView` 联合类型加 `'messages'`。badge props 由 `pending: number` 泛化为：

```ts
export function CoachRail({ view, badges, onChange }: {
  view: CoachView
  badges?: Partial<Record<CoachView, number>>
  onChange: (view: CoachView) => void
})
```

渲染：`const count = badges?.[tab.id] ?? 0` → `count > 0 && <span className="coach-rail-badge">{count > 99 ? '99+' : count}</span>`。两处 shell 的调用点改成 `badges={{ requests: bindRequests.length, messages: unreadTotal(conversations) }}`（`conversations` 为 `null` 时 `unreadTotal` 返回 0）。

### 3.2 页面骨架（`MessagesPage.tsx`）

单文件双层，同页 `activeId` 切换（照 `StudentBoard` 的 roster/detail 形状）。**不复用 `PageTop`**——它的学员下拉语义是「选学员」，与会话选择冲突，且会把 `studentId` 状态污染进其它 tab。自绘 header 复用既有类。

```
<main className="data-page chat-page">
  ├─ <header className="page-top">
  │    activeId == null:  ← 无返回按钮
  │      <span className="page-eyebrow">COACH / 消息</span>
  │      <span className="page-divider" />
  │      <span className="page-spacer" />
  │      <select className="student-select">＋ 发起对话 …</select>   // §3.6
  │      <span className="page-status">● N 条未读 · 30s 自动刷新</span>
  │    activeId != null:
  │      <button className="page-back">← 全部会话</button>
  │      <span className="page-eyebrow">COACH / 消息</span>
  │      <span className="page-divider" />
  │      <b>{other_party.display_name || '未命名学员'}</b>
  │      <span className="page-spacer" />
  │      <span className="page-status">● 5s 自动刷新</span>
  ├─ conversations == null → <div className="empty-state">加载中…</div>
  ├─ activeId == null → <ConversationList />
  └─ activeId != null → <ConversationThread />
```

**布局契约（不是可选样式，是三处滚动逻辑的前提）**：`.chat-page` 必须覆盖 `.data-page` 的 `overflow:auto`：

```css
.chat-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
.chat-thread { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.chat-composer { flex: 0 0 auto; }
```

漏掉任一条的后果：`.chat-thread` 的 `scrollHeight === clientHeight`，§3.4 的首屏滚到底 / 贴底判定 / 翻历史锚点补偿三处全部退化成空操作，同时 composer 被消息流顶出 `.coach-main` 的 `overflow:hidden` 边界——输入框物理上够不着。

### 3.3 会话列表（`ConversationList`）

- 数据来自 props（`conversations: ChatConversation[]`），**不自己拉**（§4.1 单一 timer）。
- 顺序**直接信服务端返回顺序**，不本地重排。
- 每行（`.chat-row`，形状抄 `.request-row`）：
  - `.avatar`：`display_name.slice(0,1)`；`display_name` 为空串时显示 `?`。
  - 主行：`display_name || '未命名学员'`
  - 次行：`last_message?.preview ?? '还没有消息'`，**单行截断**（`text-overflow: ellipsis`，服务端 preview 不截断，可能整条 4000 字）
  - 右侧：`chatRelativeTime(last_message_at, now)`（`last_message_at` 为 null 时空白；`now` 来自 §3.7 的时钟 tick）
  - 未读：`unread_count > 0` 时右侧一个 8px 红点（**不显示数字**，与 iOS 会话行一致；数字只出现在 rail badge）
  - 失效会话（§6.2）：整行 `opacity: .45` + 次行前缀 `（已解除绑定）`
- 空态：`<div className="empty-state">暂无会话</div>`（**仅当 `conversations` 已加载且长度为 0**；未加载走 §3.2 的「加载中…」）

### 3.4 消息流（`ConversationThread`）

```
<div className="chat-thread" ref={scrollRef}>
  {hasMoreHistory && <button className="chat-more">加载更早消息</button>}   // 显式按钮，W1 不做 sentinel 自动触发
  {renderedMessages.map(m => <ChatBubble key={m.id} … />)}
  {pendingItems.map(p => <PendingBubble key={p.clientId} … />)}
</div>
<form className="chat-composer">…</form>
```

- **`ConversationThread` 持有自己那份 conversation 快照**：进入会话时从 `conversations` find 一次存进本地 state，之后只做**字段级 merge**（`unread_count` / `my_last_read` / `other_last_read` / `other_party`），**永不因列表刷新把它变成 `undefined`**。后端没有单会话读端点，这是唯一能让 header 与回执在列表被整份替换时不崩的办法。
- **气泡分栏**：`m.sender_id === me.id` → 右侧（`.chat-bubble.mine`）；否则左侧。
- **气泡内容按 `kind` 分派**（`renderMessageBody`）：
  - `text` → `<p>{m.body}</p>`，CSS 必须 `white-space: pre-wrap` **且** `overflow-wrap: anywhere`（实测：只加 pre-wrap 时 4000 个连续 ASCII 字符仍会撑到 34164px，而 `.coach-main` 是 `overflow: hidden`，超宽内容被静默裁切且用户滚不回来）
  - `image` → `m.image_url ? <img src={m.image_url} loading="lazy" onError={…§6.6} /> : <span className="chat-image-missing">图片暂不可用</span>`
  - **default（未知 kind）** → `<span className="chat-unknown">当前版本暂不支持的消息类型</span>`（前向兼容，为组卡片留门）
- 时间：气泡下方 `chatRelativeTime(m.created_at, now)`。
- **回执**：只在「我发的**最后一条**」气泡下方显示，`other_last_read.seq >= m.seq` → `已读`，否则 `已送达`。其余气泡不显示任何状态。
- 空消息流：`<div className="empty-state">还没有消息</div>`
- **滚动**：
  - 首屏加载完成 → 直接滚到底（`scrollTop = scrollHeight`，不用 smooth）。
  - 轮询拉到新消息时，**只有用户当前贴底**（`scrollHeight - scrollTop - clientHeight <= 48`）才自动滚到底；否则不动（不打断正在看历史的教练）。
  - 点「加载更早消息」后保持锚点：记录调用前 `scrollHeight`，数据落地后 `scrollTop += (newScrollHeight - oldScrollHeight)`。

### 3.5 输入区（`ChatComposer`）

```
<form className="chat-composer" onSubmit={…}>
  <textarea placeholder="输入消息" maxLength={4000} rows={1} />
  <button type="submit">发送</button>
</form>
```

- **中文输入法守卫（红线，不是打磨项）**：`onKeyDown` 第一行必须是
  ```ts
  if (e.nativeEvent.isComposing || e.keyCode === 229) return
  ```
  否则拼音候选窗里按 Enter 选词会把半成品（拼音串或半句）当成一条真消息发到学员手机上——单语中文 app 里这是**每条消息的默认路径**，不是边缘 case。仓里已有正解范式（`DayColumn.tsx::GuardedInput` 的 composing ref），composer 额外用 `onCompositionStart/End` 维护一个 `composing` ref 作为双保险（部分旧 WebView 的 `isComposing` 不可靠）。
- 守卫之后：`Enter` 发送，`Shift+Enter` 换行。
- **草稿活过 tab 切换**：`textarea` 的值由 composer 本地 state 承接（每键只重渲 composer），在**失焦 / 切会话 / 组件卸载**时把 `{conversationId: text}` 上抛给 `PlanWorkspace` 的 `chatDrafts`；重新进入该会话时回填。`activeId` 同样提在 `PlanWorkspace`（§4.1）——切去编辑器再切回来，会话选中态与半句草稿都还在。
- 发送前 `trim()`，空串直接 return（不发请求；后端 `z.string().min(1)` 会放行纯空白，不依赖它）。
- `maxLength={4000}`（DOM `maxlength` 按 UTF-16 码元计数，**恰好与后端 zod 同口径**，见 §6.7）。
- `font-size: 16px`（防移动 Safari 聚焦自动缩放，成本为零，顺手做对）。
- 会话被判定失效（§6.2）或 `sessionDead`（§6.1）时：`textarea` + 按钮 `disabled`，下方一行 `<em className="chat-blocked">该学员已不在你的名下，无法继续发送</em>`（sessionDead 时不显示这句，靠顶部横幅承担）。
- 发送后**立即清空输入框**，气泡以 `sending` 态出现在消息流末尾；失败时气泡变 `failed` 态并带「重试」按钮，**文本不回填输入框**（重试按钮就是回收路径）。

### 3.6 发起对话（get-or-create）

header 上一个 `<select className="student-select">`，选项来自 props 传入的 `students: CoachStudent[]`（`CoachStudent.id` 就是学员 `users.id`，可直接当 `other_user_id`）。**已有会话的学员照常列出**——`POST /conversations` 是幂等 get-or-create，201/200 都进同一个线程，所以这个下拉同时就是「按姓名定位已有会话」的入口（§1.2 里不做独立搜索框的依据）。

- 选中 → `openConversation(student.id)` → 成功后 `applyConversations(prev => merge(prev, conversation))` 并 `setActiveId(conversation.id)`。
- **403 `CHAT_BIND_REQUIRED`**（学员已换教练；花名册没有 canonical 收敛，前学员照样在下拉里）→ header 下方一行提示 `该学员已不在你的名下`，并把该 `studentId` 记进 `MessagesPage` 内部的 `unavailableStudentIds`，该选项置灰 `disabled`。**不进 `bindLostIds`**（此时根本没有 conversationId）。
- `409` / `429` / 网络错误 → 同一行提示 `发起对话失败，请重试`，不置灰。

### 3.7 相对时间的自刷新

线程与列表共用一个 `useClockTick(60_000)`：**零请求**，只在 `view === 'messages'` 且页面可见时每 60 秒 `setState(Date.now())`，把 `now` 传给 `chatRelativeTime`。否则摊一下午的会话里所有气泡会永远停在「刚刚」。

### 3.8 中文文案（逐字取自 iOS `Localizable.xcstrings`，app 与网页同为单语中文）

| 场景 | 文案 |
|---|---|
| tab 名 | 消息 |
| 会话列表空态 | 暂无会话 |
| 图片消息预览 | `[图片]`（**服务端给，前端原样显示**） |
| 图片不可用 | 图片暂不可用 |
| 发送中 | 发送中 |
| 发送失败 | 发送失败 |
| 重试按钮 | 重试 |
| 回执 | 已送达 / 已读 |
| 输入框占位 | 输入消息 |
| 发送按钮 | 发送 |
| 翻历史 | 加载更早消息 |
| 未读无障碍标签 | `N 条未读` |
| 相对时间 | 刚刚 / N 分钟前 / N 小时前 / N 天前 / N 个月前 / N 年前 |

web 新增文案（iOS 无对应 key，标注出来以便将来对齐）：`加载中…`、`还没有消息`、`未命名学员`、`该学员已不在你的名下，无法继续发送`、`该学员已不在你的名下`、`发起对话失败，请重试`、`会话不存在`、`当前版本暂不支持的消息类型`、`登录已过期，请刷新页面重新登录`、`＋ 发起对话`。

---

## 4. 数据流与轮询策略

### 4.1 状态归属（单一数据源，单一 timer）

| 状态 | 归属 | 说明 |
|---|---|---|
| `conversations: ChatConversation[] \| null` | **`PlanWorkspace`** | `null` = 未加载（区别于零会话）。未读红点要在任意 tab 下都更新，所以列表必须在顶层轮询 |
| inbox 轮询 timer | **`PlanWorkspace`**（唯一一个） | 与既有 `getBindRequests` 合并进同一个 hook，一拍发两个请求 |
| `inboxRequest` 代际号 | **`PlanWorkspace`** ref | 见 §4.4 |
| `sessionDead: boolean` | **`PlanWorkspace`** | 见 §6.1 |
| `bindLostIds: Set<string>` | **`PlanWorkspace`** | 切 tab 不能丢，否则回来输入框重新可用、教练再敲一遍再 403 |
| `chatActiveId: string \| null`、`chatDrafts: Record<string,string>` | **`PlanWorkspace`** | 切 tab 保留选中会话与半句草稿（§3.5） |
| `messages`、`hasMoreHistory`、已读游标、conversation 快照 | `ConversationThread` 内部 | 切走 tab 即卸载，回来重新首屏加载 |
| 待发队列（pending/failed/confirmed） | **模块级单例 `chatOutbox`** | 见 §4.5，必须活过 tab 切换 |

`MessagesPage` 的 props：

```ts
{
  me: AuthUser                       // 由 App.tsx → PlanWorkspace → 这里，非空
  students: CoachStudent[]
  conversations: ChatConversation[] | null
  bindLostIds: ReadonlySet<string>
  sessionDead: boolean
  activeId: string | null
  drafts: Readonly<Record<string, string>>
  onActiveIdChange: (id: string | null) => void
  onDraftChange: (conversationId: string, text: string) => void
  /** updater 形式：所有子组件写入都经这一个口，PlanWorkspace 侧函数式 setState + bump 代际号 */
  onConversationsChanged: (update: (prev: ChatConversation[]) => ChatConversation[]) => void
  onReadStateApplied: (conversationId: string, state: ChatReadState) => void
  onBindLost: (conversationId: string) => void
  onSessionExpired: () => void
}
```

**为什么回调必须是 updater 形式**：`MessagesPage` 手上的 `conversations` 是 props 快照。若「发起对话并入列表」「404 移除该条」回写一个用旧快照算出来的整份数组，它会把并发落地的 inbox 刷新整体回退——刚清的红点复活、刚到的预览消失，且 §4.4 的代际闸完全管不着（它只挡在飞的 inbox 响应，不挡来自子组件的整份覆盖）。

### 4.2 轮询节奏与限流预算

| 层 | 频率 | 条件 | 稳态 req/min |
|---|---|---|---|
| inbox（`GET /conversations` + `getBindRequests`） | **60s** | `view !== 'messages'` | 1 + 1 |
| inbox | **30s** | `view === 'messages'` | 2 + 2 |
| 会话内增量（`GET /messages?since_seq`） | **5s** | 线程打开且页面可见 | 12 |
| `POST /read` | 事件驱动 | §4.4 四闸全满足且本批有对方新消息 | 实测远低于 12 |

**稳态最坏合计 ≈ 28 req/min**（消息 tab + 线程都开着）。

**峰值与它的封顶**：一次积压追平在单拍内可翻多页（§4.3），`maxPages = 10`（10 × limit 50 = 500 条）。为防「越限流→拍越长→重叠越多」的正反馈，追平循环把翻页数反馈给调度器：

```
下一拍延迟 = pagesFetched > 1 ? min(30_000, pagesFetched * 2_000) : 5_000
```

即满载一拍（10 页）之后等 20 秒 → 峰值 ≈ 30 req/min，追平完立刻回落到 12。任何情况下都不会出现「上一拍还在飞就起下一拍」（见下文自调度契约）。

**inbox 为什么是 30s 不是 15s**：`GET /conversations` 无分页且每条会话 5 次 DB 查询，侦察档案的明文建议是列表轮询 ≥30s；而消息 tab 打开时当前会话已由 5s 线程轮询覆盖，inbox 只为**其它**会话的红点买单，15s 的收益与代价不成比例。带 30 个学员（含 §6.2 那些永不消失的死会话）时，30s ≈ 150 次 DB 查询/分钟，仍在内测可承受区间——但这条依赖「后端零改动」，其有效期登记进 §10。

**频率只有一个事实源：`view === 'messages'`。** 不引入 `onActiveChanged` 之类的第二路信号——两者在 `changeView` 的 `viewTransitioning` 窗口里会短暂不一致，导致定时器反复重建。

**启用条件（写进契约，不是实现细节）**：

```ts
useVisiblePolling(tick, view === 'messages' ? 30_000 : 60_000, {
  enabled: !sessionDead && students.length > 0,
  immediate: false,
})
```

`students.length > 0` 这一闸必须写在 `enabled` 里：hooks 跑在 `if (students.length === 0) { … return }` 那支整支 return **之前**，不加闸就会在零学员空态下发起 `listConversations`，直接顶掉验收 §8.1/13。

**首屏（两个缺口，必须都补）**：

1. boot effect 在 `getCoachStudents` 解析出 `st` 之后、`st.length > 0` 时并发拉一次 `listConversations().catch(() => [])`，落进 `conversations`。**不补这条，登录后到第一个 60s tick 之间 rail 红点恒不亮**（顶掉目标 1.1 与验收 §8.2/15）。
2. `view` 切到 `'messages'` 时用一个独立的一次性 effect 强拉一次 inbox。**不补这条，教练带着最长 60s 的陈旧列表进门**；而 `conversations` 用 `null` 区分「未加载 / 零会话」正是为了让这一瞬间显示「加载中…」而不是假空态「暂无会话」。

**所有轮询在 `document.visibilityState !== 'visible'` 时暂停**，回到可见立即拉一次再恢复——这是 iOS `scenePhase` 闸在网页端的等价物，也是长挂 tab 成本归零的关键。抽成 `src/features/chat/useVisiblePolling.ts`：

```ts
export function useVisiblePolling(
  tick: () => Promise<number | void>,   // 返回值 = 覆盖本次的下一拍延迟(ms)
  intervalMs: number,
  opts?: { enabled?: boolean; immediate?: boolean },
): void
```

契约（每一条都要有测试）：

- **自调度 `setTimeout`，不是 `setInterval`**：一拍 settle（resolve 或 reject）之后才排下一拍。这天然实现单飞——上一拍未结算绝不起第二拍。**这条是硬性的**：`client.ts` 的 `rawRetrying` 对 429 最多退避 6 次、每次上限 60s，单个请求可在飞约 6 分钟；`setInterval` 会在退避期间叠出几十个并发 tick，而被 429 拒的请求仍然计数，等于主动阻止限流桶恢复。
- `tick` 存进 ref（每次 render 更新），**不进 effect deps**；只有 `intervalMs` / `enabled` 变化才重建调度。否则内联箭头函数每次重渲染都会重置定时器。
- 挂载 / `enabled` 变 true / `visibilitychange` 转可见 → 若 `immediate` 则先跑一次 `tick()`，再排下一拍。
- 转不可见 / 卸载 / `enabled` 变 false → 清 timer（在飞的 fetch 不强制 abort，其响应由各自的代际号作废）。
- `tick` 抛错**不停表**（按 `intervalMs` 排下一拍），除非是 401（§6.1 会把 `enabled` 置 false）。
- 顶层用 `immediate: false`（boot 已经拉过一次，避免开机双拉）；线程内用 `immediate: true`。

**轮询请求走「不退避」通道**：给 `client.ts` 加一个可选开关（`api.get(path, { retryRateLimit: false })` → `request` → `rawRetrying`），聊天的**所有轮询 GET** 用它，429 立即抛出、本拍静默跳过；**发送 POST 保留默认退避**（教练手动动作，让它慢慢挤进去是对的）。
⚠️ 改 `client.ts` 时**绝不碰 `configuredApiBase` 的函数体**——backend `build-push-staging.yml:45-52` 的两条 grep marker 是按它压缩后的字面形状写死的，改了会让机械闸假红/假绿。加参数不影响该函数，验收 §8.1/2 会本地自检一次。

`PlanWorkspace.tsx:145-148` 的裸 `setInterval` **由这个 hook 取代**，`getBindRequests` 顺带获得可见性暂停、回前台立即刷新与重入闸——这是本卡对既有行为的唯一一处改动，必须有测试覆盖。

### 4.3 会话内增量：`since_seq` 追平循环

每个 tick：

1. `from = maxSeq(messages)`（本地已知最大 seq；本地为空则走 `mode: 'latest'` 首屏路径，见下）。
2. 循环 `getMessages(id, { mode: 'since', seq: cursor, limit: 50 })`：
   - 合并进本地（`mergeMessages`）；
   - `cursor = 新的 maxSeq`；
   - `page.meta.has_more === true` **且** cursor 严格前进 → 继续下一页；否则 break。
   - 硬上限 `maxPages = 10`，防失控（真积压超过 500 条会在后续 tick 继续追）。
3. 追平后跑一次 `markReadIfNeeded`（§4.4）。
4. 把本拍实际翻页数返回给 `useVisiblePolling`，由它换算下一拍延迟（§4.2）。

**为什么必须循环**：服务端 `since_seq` 刻意取**最早**的一批（防跳过中间消息），只拉一页会在积压 > limit 时永久落后。

**首屏（进入会话时）**：`getMessages(id, { mode: 'latest', limit: 50 })` → `meta.has_more` 记进 `hasMoreHistory`（**latest/before 页上的 `has_more` 表示「还有更早的历史」，与 since 页方向相反**）→ 滚到底 → **显式跑一次 `markReadIfNeeded`（用首屏这批消息）**。
漏掉首屏这一次的后果：「学员昨天发了 3 条、今天教练点进去看完、期间没有新消息」这个最常见场景下，后续每一拍 `since_seq` 都返回空批，`markReadIfNeeded` 永不触发，`unread_count` 永不清零——rail 红点常驻、学员端永远看不到「已读」。iOS 是在 `load()` 后和每个 tick 后各打一次，两半都要移植。

翻历史：`getMessages(id, { mode: 'before', seq: 本地最小 seq, limit: 50 })`，回来更新 `hasMoreHistory = page.meta.has_more`。

API 层用类型强制游标互斥，杜绝同传 400：

```ts
export type MessagesQuery =
  | { mode: 'latest'; limit?: number }
  | { mode: 'since'; seq: number; limit?: number }
  | { mode: 'before'; seq: number; limit?: number }
```

### 4.4 已读打点

**触发条件（四闸全满足才发，比 iOS 严格）**：

1. 线程页当前打开（列表页**不打**）；
2. `document.visibilityState === 'visible'`；
3. `document.hasFocus() === true`（窗口没被别的 app 盖住）；
4. **近 `INTERACTION_WINDOW_MS = 120_000` 内该 tab 有过用户交互**（`pointerdown` / `keydown` / `wheel` / `scroll` / `focus` 任一，记一个 `lastInteractionAt` ref；进入会话这个动作本身就刷新它）。

第 3、4 条是本卡相对草稿新增的，理由必须记住：**已读游标是跨设备唯一、`GREATEST` 单调、不可回退的破坏性写，服务端也分不出这次 `POST /read` 来自网页还是手机。** 教练的常态就是把消息 tab 连同某个会话摊在副屏上然后去带课——`visibilityState` 在那两小时里一直是 `'visible'`。没有交互闸，网页会每 5 秒替他把学员的新消息标成已读，他的 iPhone 红点永远不亮，且没有任何恢复接口。120 秒是默认值：足够覆盖「盯着屏幕读长消息」的静止期，又能在离席两分钟后停手。

满足后 `POST /read {message_id: 本批对方消息中最大 seq 那条的 id}`（**用 message_id 不是 seq**），且要求该 seq `>` `latestRequestedReadSeq`。

并发处理照搬 iOS：

- `readRequest` 计数器作废迟到响应；
- 成功 → `latestAppliedReadSeq = latestRequestedReadSeq = 响应里的 my_last_read.seq`（**以服务端返回为准**，可能比自己打的更高）；
- 失败 → `latestRequestedReadSeq` 回滚到 `latestAppliedReadSeq`，下个 tick 自动重试；
- 成功后调 `onReadStateApplied(conversationId, state)` 把 `unread_count` / `my_last_read` 回灌进 `PlanWorkspace`。
- **`onReadStateApplied` 是 `PlanWorkspace` 持有的稳定回调，即使 `ConversationThread` 已卸载也照常执行**（不挂组件生命周期）。否则「教练点完会话立刻切走」这一瞬间会留一个红点复活窗口：早于 markRead 采样的 inbox 响应此时没有任何代际闸挡它。

**防红点复活（统一闸）**：`PlanWorkspace` 维护 `inboxRequest = useRef(0)`。

- **所有非轮询来源的 `conversations` 写入**（markRead 回灌、`openConversation` 并入新会话、404 移除、发送后本地更新）一律经由 `applyConversations(updater)`，它内部先 `inboxRequest.current += 1` 再函数式 `setConversations`。
- inbox 轮询发请求前捕获 `const gen = inboxRequest.current`，响应落地前比对 `gen === inboxRequest.current`，不等则整份丢弃。

只 bump markRead 一处是不够的：`openConversation` 刚建的会话会被一个采样更早的 inbox 响应整份抹掉，而 `activeId` 仍指着它——`conversations.find(...)` 变 `undefined`，header 读 `other_party.display_name` 直接 TypeError，最长 15-60s 才自愈。（§3.4 的「线程自持快照」是同一个洞的第二道防线。）

### 4.5 发送队列（`chatOutbox`）

**模块级单例**（不是组件 state）——教练切到编辑器再切回来，`sending`/`failed` 必须还在，且在途的 POST 要继续跑。这是 iOS `ChatSessionController`（session 级 outbox）在网页端的最小等价物。

```ts
// src/features/chat/chatOutbox.ts
export type OutboxState =
  | { state: 'sending' }
  | { state: 'failed'; code?: string; retryable: boolean }
  | { state: 'confirmed'; message: ChatMessage }   // 交接态，不是渲染态
export interface OutboxItem {
  clientId: string
  conversationId: string
  body: string
  status: OutboxState
}
export interface ChatOutbox {
  itemsFor(conversationId: string): OutboxItem[]
  enqueue(conversationId: string, body: string): void
  retry(clientId: string): void
  discard(clientId: string): void
  /** 轮询拉到的消息里若有我发的、client_id 命中的，摘掉对应 pending（气泡由正文接管） */
  reconcile(conversationId: string, messages: ChatMessage[], myUserId: string): void
  /** 线程把 confirmed 的 message merge 进正文后调用，摘掉交接态 */
  acknowledgeConfirmed(clientId: string): void
  subscribe(listener: () => void): () => void
  /** 发送路径上的错误出口（401 要能到达 PlanWorkspace，见 §6.1） */
  setErrorSink(sink: ((e: unknown) => void) | null): void
  reset(): void
}
export const chatOutbox: ChatOutbox   // 用真实 sendTextMessage 构造的单例
export function createChatOutbox(deps: { send: (…) => Promise<ChatMessage> }): ChatOutbox  // 可测
```

规则：

- **`clientId` 生成不得依赖 `crypto.randomUUID`**（§2.1：线上是非 secure context，它是 `undefined`，会在 `enqueue` 里同步抛 TypeError——不是 `ApiException`，落不进 §6.5 任何分支，composer 直接炸，而 jsdom 里测试全绿）。放进 `chatModel.ts`：

  ```ts
  export function newClientId(): string {
    const bytes = new Uint8Array(16)
    const c = globalThis.crypto
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)   // 非 secure context 也可用
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
    let hex = ''
    for (const b of bytes) hex += b.toString(16).padStart(2, '0')
    return `web-${Date.now().toString(36)}-${hex}`   // ≈45 字符，落在后端的 1..64 内
  }
  ```
  后端对 `client_id` 只要求 1..64 字符、无格式要求，所以不必是 UUID。
- **`retry` 复用同一个 `clientId`**——这正是幂等键的兑现点；换 ID = 制造重复消息。
- **成功响应先交接、再摘气泡**：`send` resolve → item 转 `confirmed(message)` → 订阅者（`ConversationThread`）在**同一次 setState 批次**里把 `message` merge 进 `messages`，然后调 `acknowledgeConfirmed(clientId)` 摘掉。
  不做交接态的后果：pending 气泡先消失、正文里还没有 → 要等下一拍 5s 轮询才补回来；快速连发 3-5 条时整片气泡集体闪没再出现，教练会以为丢了并重发。
- 成功响应回来时，若该 clientId 已被 `reconcile` 摘掉（轮询先到），**丢弃响应，不复活气泡**。
- 同一 conversation 的发送**串行**（单飞 drain，形状抄 `autosave.ts::createSaveController`），保证 seq 与教练敲击顺序一致。
- `setErrorSink` 由 `PlanWorkspace` 在挂载时注册 `(e) => { if (isSessionExpired(e)) setSessionDead(true) }`，卸载时置 null。
- `App.tsx` 的 `onLogout` 里调 `chatOutbox.reset()`（**统一用这个方法名，不再导出 `resetChatOutbox`**）。

---

## 5. 与 iOS 的行为一致性契约

**必须照搬（不照搬会出现跨端可见的错乱）：**

| # | 契约 | web 落点 |
|---|---|---|
| 1 | `client_id` 幂等；重试复用同一个 ID | `chatOutbox.retry` |
| 2 | `seq` 是唯一合并键，后到覆盖先到，渲染前本地按 seq 升序 | `chatModel.mergeMessages` |
| 3 | `has_more` 方向语义相反（latest/before = 还有更早；since = 还有更新）；一个 tick 内追平 | `chatSync.catchUpSince` + `ConversationThread` 首屏分支 |
| 4 | 已读用 `message_id`、游标单调不回退、single-flight + 失败回滚；**首屏后与每拍后各打一次** | `ConversationThread.markReadIfNeeded` |
| 5 | markRead 结果回灌列表**并作废在飞的列表刷新** | `PlanWorkspace.applyConversations` + `inboxRequest` |
| 6 | 未读数**只信服务端**，客户端从不本地计数 | `chatModel.unreadTotal(conversations)` 求和；本地唯一写入路径是 markRead 响应 |
| 7 | 回执「仅我最后一条 + 闭区间（`other_last_read.seq >= m.seq`）」 | `chatModel.readReceiptFor` |
| 8 | 中文相对时间**手写分档**，不用 `Intl` / locale 格式化：<60s 刚刚；<1h N 分钟前；<24h N 小时前；<30 天 N 天前；<365 天 N 个月前（30 天=1 月）；否则 N 年前（365 天=1 年） | `chatModel.chatRelativeTime` |
| 9 | 图片 15 分钟签名，过期用 `before_seq = seq + 1 & limit = 1` 单条重取续签 | §6.6 |
| 10 | 未知 `kind` 前向兼容降级，不崩不空白 | `renderMessageBody` 的 `default` 分支；`ChatMessage['kind']` 声明为开放联合 `'text' \| 'image' \| (string & {})`，否则 default 分支对 TS 是不可达死代码，后端下发新 kind 时类型层先崩 |
| 11 | 会话排序信服务端（`last_message_at DESC NULLS LAST, id DESC`），不本地重排 | `ConversationList` 直接 map |
| 12 | wire 全 snake_case，**不要照搬 iOS DTO 的 camelCase 字段名** | `src/api/types.ts` 的 Chat* 类型 |
| 13 | 发送成功走「confirmed 交接态」而不是直接摘气泡 | `chatOutbox` + `acknowledgeConfirmed` |

**允许的偏差（刻意不一致，登记在案）：**

| 偏差 | web 做法 | iOS 做法 | 理由 |
|---|---|---|---|
| 轮询节奏 | 会话 5s / inbox 30s（消息 tab 打开）、60s（未打开） | 会话 3s / inbox 30s | 浏览器 tab 长挂 + 与 autosave 共享 per-IP 100 req/min 桶 + `GET /conversations` 每条会话 5 次 DB 查询 |
| 轮询调度 | 自调度 `setTimeout`，一拍 settle 后才排下一拍；429 不退避、直接跳拍 | `sleep`-at-loop-top 的顺序循环，天然单飞；429 零退避但立刻重试 | 结构等价；web 额外要躲开 `client.ts` 那条最长 6 分钟的 429 退避链 |
| **已读触发** | 线程打开 **且** 页面可见 **且** 窗口有焦点 **且** 近 120s 有用户交互 | 会话页在栈上、app 在前台就打（切 tab、盖 sheet 时照打） | 已读游标是跨设备单调不可回退的破坏性写。桌面浏览器「标签页可见但无人看屏」是教练的常态（副屏摊着去带课两小时），没有交互闸就会替他的手机永久清掉红点。**iOS 侧那个口子是它自己的已知问题，登记但不在本卡范围——本卡不拿「比 iOS 保守」当论证，四闸的依据是「该不该替另一台设备清红点」** |
| outbox 生命周期 | 模块级单例（tab 内活着，刷新即丢） | session 级（跨页面栈存活） | 网页刷新等于整页重置，做持久化收益 < 复杂度 |
| 竞态守卫 | `clientId` 去重 + 请求代际号 + 统一 `applyConversations` 闸 | generation / settledClientIDs / isDraining 三重机器 | iOS 那三重是为「登出与换绑期间 MainActor 可重入」写的，网页登出即整页状态清空，没有等价压力 |
| 翻历史触发 | 显式「加载更早消息」按钮 | 顶部 sentinel 自动触发 | 省一个 IntersectionObserver + 滚动锚定复杂度，W1 够用 |

---

## 6. 错误与边界

### 6.1 token 过期 / 会话失效（401）

现状：plan-web **没有任何全局 401 → 回登录页的通道**，`logout()` 只有三个与 401 无关的调用点，而既有 60s 轮询的 `.catch(() => undefined)` 会把 401 吞得一干二净——页面停在旧数据上，教练毫无察觉。

本卡范围内的最小自保（不做全局通道，那是另一张 T1 卡）：

- 新增 `src/api/errors.ts`：

  ```ts
  export const isSessionExpired = (e: unknown) =>
    e instanceof ApiException && e.status === 401
  export const isBindLost = (e: unknown) =>
    e instanceof ApiException && e.status === 403 && e.code === 'CHAT_BIND_REQUIRED'
  export const isRateLimited = (e: unknown) =>
    e instanceof ApiException && e.status === 429
  ```

  顺手把 `ChangePasswordDialog.tsx` 里的本地 `isSessionExpired` 副本删掉，改 import 同一个；**同批必须改 `ChangePasswordDialog.test.ts:3` 的 import**（它现在从 `./ChangePasswordDialog` 取这个符号，不改则 `tsc --noEmit` 与 `npm test` 双挂）。断言原样保留在该测试里——它们描述的正是这个弹窗依赖的行为。
- **传导通道（两个方向都要有，缺一条就是死状态）**：
  - 向上：轮询 tick / markRead / `openConversation` 的错误经 `MessagesPage` 的 `onSessionExpired()`；发送路径经 `chatOutbox.setErrorSink`（`PlanWorkspace` 挂载时注册）。
  - 向下：`sessionDead: boolean` 作为 prop 传进 `MessagesPage`（禁用 composer）。
- `sessionDead = true` 后：
  - **停止全部轮询**（`useVisiblePolling` 的 `enabled` 传 false）；
  - **横幅挂在 `coach-shell` 层，不是消息 tab 内**：`.chat-session-banner { position: fixed; top:0; left:0; right:0; z-index:200 }`，文案 `登录已过期，请刷新页面重新登录`，**两处 shell 都渲染**。
    理由：inbox 轮询在任意 tab 都在跑，401 最可能在教练埋头写计划时被检测到。此刻全部轮询已永久停摆、autosave 只会吐一句与断网同形的「自动保存失败 · 改动已保留」，而唯一的真相若只挂在消息 tab 里，教练根本不会去点——那样「停掉全部轮询」这个副作用比不做还危险。
  - **不调 `logout()`**——它的第三步 `clearAllDraftMirrors()` 会在「教练的改动恰好存不上去」那一刻抹掉唯一的本地草稿副本。只提示，让教练自己决定何时刷新。

### 6.2 前教练会话（canonical 缺口）

后端 `GET /conversations` 的教练分支只有 `WHERE coach_id = me`，**没有任何绑定状态过滤**；`bind_requests.accepted` 是终态、代码里没有解绑路径，所以「换教练」= 新增一条 accepted，旧教练的会话**永远**挂在他的列表里。`ConversationWire` 里没有 `is_active` / `can_send`，死会话和活会话结构上完全不可区分。

W1 三闸（后端零改动前提下的最优解）：

- **静态弱闸**：`conversation.other_party.id` 不在 `students` 花名册里 → 直接判定失效，会话行置灰、输入框禁用。（注意：`GET /coach/students` 同样没有 canonical 收敛，前学员照样在名单里，所以这个闸只挡得住一部分。）
- **发送侧 403 硬闸**：`sendTextMessage` 拿到 `CHAT_BIND_REQUIRED` → `onBindLost(conversationId)` 记进 `PlanWorkspace` 的 `bindLostIds`（切 tab 不丢），禁用输入框、置灰会话行，把这条 pending 标为 `failed` 且 `retryable: false`（**不给重试按钮**，重试必然再 403），文案 `该学员已不在你的名下，无法继续发送`。
- **发起对话侧 403 硬闸**：`openConversation` 拿到 `CHAT_BIND_REQUIRED` → §3.6 的一行提示 + 该学员选项置灰；**不进 `bindLostIds`**（还没有 conversationId）。
- 已读仍可打（后端 `POST /read` 只做成员校验、不查 canonical），所以死会话的红点点进去能清掉——**这是特意保留的**，否则那几条未读会永久卡在 rail 上。
- **不做**「一次上报就拆掉整个 chat graph」（iOS 学员端的做法）——网页端是教练侧，一个学员失效不该影响其它会话。

### 6.3 空态

| 场景 | 表现 |
|---|---|
| 教练零学员（`students.length === 0` 空态 shell） | `{(view === 'board' \|\| view === 'videos' \|\| view === 'messages') && <div className="empty-page">接受学员申请后即可{…}</div>}`，messages 的文案是 `接受学员申请后即可与学员聊天`。**不发任何聊天请求**（由 §4.2 的 `enabled` 闸保证）。 |
| `conversations === null`（未加载） | `加载中…`；**不显示「暂无会话」** |
| 有学员、零会话 | `暂无会话` + header 的「＋ 发起对话」可用 |
| 会话存在、零消息 | `还没有消息` |
| `display_name` 为空串 | 显示 `未命名学员`，头像显示 `?` |
| `last_message === null` | 预览显示 `还没有消息`，时间列空白（该会话因 `NULLS LAST` 排在有消息的会话之后） |
| OSS 未配置（`image_url === null`） | 图片位显示 `图片暂不可用`，文本消息照常 |

### 6.4 多标签页

W1 **不做**跨 tab 协调，登记为已知限制：

- 两个 tab 各跑一套轮询 → 稳态请求量翻倍（最坏 ≈56 req/min，仍在 100 内，但要知道）。
- 一个 tab 打了已读，另一个 tab 的红点消失时机取决于那个 tab 的状态：停在消息 tab 且可见 → ≤30s；停在别的 tab → ≤60s；**被切到后台 / 最小化 → 按 §4.2 完全暂停，可能挂几小时，直到教练切回来那一刻立即刷新**。这不是 bug（未读数只信服务端，回来立刻对齐），但别把它写成「≤15s 自然消失」。
- A tab 登出后 B tab 会静默 401 → 走 §6.1 的横幅。
- **`chatOutbox` 是模块级不是 localStorage**，两个 tab 各有各的队列，不会出现同 clientId 竞态。

### 6.5 各错误码的前端分支

| 码 | 处理 |
|---|---|
| `401 AUTH_INVALID_TOKEN` | §6.1（轮询、markRead、发送、openConversation 四条路径都要能到达） |
| `403 CHAT_BIND_REQUIRED`（发送） | §6.2 发送侧硬闸 |
| `403 CHAT_BIND_REQUIRED`（发起对话） | §3.6 + §6.2 发起侧硬闸 |
| `404 CONVERSATION_NOT_FOUND` | `applyConversations(prev => prev.filter(...))` 移除该条 + 回到列表页 + 一行提示 `会话不存在` |
| `409 CHAT_SEQUENCE_CONFLICT` | **SPEC 未列的隐形契约**：用**同一个 clientId** 自动重发一次（幂等键保证不会产生第二条）；仍失败则置 `failed`（retryable）交给教练手动重试 |
| `400 CHAT_INVALID_CURSOR` | markRead 的 message_id 不属于该会话（理论上不该发生）→ 回滚游标，**本轮不重试同一条**，避免死循环；`console.warn` 一行 |
| `400 VALIDATION_ERROR` | 置 `failed`（retryable），气泡下显示 `发送失败`（不展开 `issues`） |
| `429 rate_limited` | 轮询走不退避通道 → **静默跳过本拍，不停表**；发送保留 `client.ts` 的 6 次退避，耗尽后置 `failed` 可重试 |
| 网络错误（fetch reject，非 `ApiException`） | 与 429 同处理：轮询跳过、发送置 `failed`。**不当作鉴权失效** |

### 6.6 图片续签

`<img onError>` → 对该条消息发一次 `getMessages(id, { mode: 'before', seq: m.seq + 1, limit: 1 })` 拿新签名 URL 并 merge 回本地。**每条消息最多强制续签一次**（用一个 `Set<messageId>` 记账），并做 0.5s 节流，防止裂图风暴。续签仍失败 → 显示 `图片暂不可用`。

### 6.7 文本长度的三端口径差

`4000` 在三端是三种数法：iOS 用字素簇（`String.count`）、后端 zod 用 UTF-16 码元、Postgres `CHECK` 用码点。后果：输入框放行了，发出去红。

W1 处理：`maxLength={4000}`（DOM `maxlength` 也按 UTF-16 码元计数，**恰好与后端 zod 同口径**，所以网页端天然不会触发这个 400）。**不改后端、不做统一**，把口径统一列进 §10 待拍板。

另注：后端 `body: z.string().min(1)` 会放行纯空白（单空格 / 纯换行 / tab）。网页端发送前 `trim()` 后判空即可自保，**不依赖后端**。

---

## 7. 文件级改动清单

> **施工现场纪律**：`meetpr-plan-web` 主 worktree 当前有 11 个未提交文件在飞（含 `PlanWorkspace.tsx` / `PlanWorkspace.test.tsx` / `reconcile.ts` 的 spec 009 WIP，其中 `reconcile.ts` 的 batch v2 字段后端并不认）。**必须从 `origin/main` 另开一次性 worktree 施工**，不要在主树上动手，也不要把主树代码当现状基准。

### 新增（8 个文件）

| 路径 | 内容 |
|---|---|
| `src/api/chat.ts` | `listConversations()` / `openConversation(otherUserId)` / `getMessages(id, query: MessagesQuery)` / `sendTextMessage(id, body, clientId)` / `markConversationRead(id, messageId)`。一行一函数，全走 `api.get/post`；**轮询用的三个 GET 传 `{ retryRateLimit: false }`**；解包习惯照 `coach.ts` |
| `src/api/errors.ts` | `isSessionExpired` / `isBindLost` / `isRateLimited` |
| `src/features/chat/chatModel.ts` | 纯函数：`mergeMessages` / `maxSeq` / `minSeq` / `latestIncomingSeq(messages, myId)` / `readReceiptFor(messages, myId, otherLastRead)` / `unreadTotal(conversations \| null)` / `chatRelativeTime(iso, now)` / `conversationPreview(c)` / **`newClientId()`** |
| `src/features/chat/chatSync.ts` | `catchUpSince(fetchPage, fromSeq, maxPages = 10)` —— 注入 fetcher，纯逻辑可测；含「seq 未前进即 break」的防打转闸；返回 `{ messages, pagesFetched }` |
| `src/features/chat/chatOutbox.ts` | `createChatOutbox(deps)` + 模块级 `chatOutbox` 单例（含 `setErrorSink` / `acknowledgeConfirmed` / `reset`） |
| `src/features/chat/useVisiblePolling.ts` | §4.2 的 hook（自调度 setTimeout + tick ref + 返回值覆盖下一拍延迟）；另含 `useClockTick(ms)`（§3.7） |
| `src/features/chat/MessagesPage.tsx` | `MessagesPage`（默认导出组件）+ 文件内 `ConversationList` / `ConversationThread` / `ChatComposer` / `ChatBubble` / `renderMessageBody` |
| `specs/006-coach-web-chat/SPEC.md` | 本文 |

### 新增测试（5 个文件，照 `CatalogPage.test.tsx` 的 `createRoot`/`act` + `vi.mock` 风格）

| 路径 | 覆盖 |
|---|---|
| `src/features/chat/chatModel.test.ts` | merge 去重与排序、回执闭区间（9/10/11 三点验边界）、相对时间六档边界（59s/60s/3599s/24h/30d/365d）、`unreadTotal(null)` = 0、**`newClientId` 在无 `crypto.randomUUID`（及无 `getRandomValues`）时仍返回 1..64 合法串且互不相同** |
| `src/features/chat/chatSync.test.ts` | 一次 tick 排空三页积压、`has_more=false` 即停、seq 不前进即停、`maxPages` 封顶、`pagesFetched` 计数正确 |
| `src/features/chat/chatOutbox.test.ts` | 重试复用同一 clientId、轮询先到时 pending 被 reconcile 摘掉、迟到的 POST 响应不复活已摘气泡、**成功先转 confirmed 再由 acknowledgeConfirmed 摘掉**、串行 drain、401 经 errorSink 上抛 |
| `src/features/chat/useVisiblePolling.test.ts` | **上一拍未 settle 时假时钟推进不会起第二拍**、tick 返回数字覆盖下一拍延迟、不可见即停 / 转可见立即跑一拍、`enabled=false` 停表、tick 抛错不停表、tick 换 identity 不重建定时器 |
| `src/features/chat/MessagesPage-ui.test.tsx` | 列表→线程下钻；markRead 后红点清零且在飞的 inbox 刷新被作废（红点不复活）；**首屏后无新消息也打一次已读**；**`isComposing` 的 Enter 不发请求 / 非 composing 的 Enter 发**；发送成功后气泡不闪断；403 后输入框禁用且无重试按钮；未知 kind 降级渲染；`conversations === null` 渲染「加载中…」而非「暂无会话」 |

### 修改（9 个文件）

| 路径 | 改什么 |
|---|---|
| `src/api/types.ts` | 追加 `ChatReadCursor` / `ChatConversation` / `ChatMessage`（`kind` 用开放联合）/ `ChatMessagePage` / `ChatReadState` / `MessagesQuery`，**全 snake_case** |
| `src/api/client.ts` | **只加一个可选开关**：`ReqOpts` 加 `retryRateLimit?: boolean`（默认 true），`rawRetrying` 据此跳过退避循环，`api.get/post` 透传。⚠️ **绝不改 `configuredApiBase` 的函数体**（backend `build-push-staging.yml:45-52` 的 grep marker 按其压缩形状写死） |
| `src/features/workspace/CoachRail.tsx` | `CoachView` 加 `'messages'`；`tabs` 末尾追加 `{ id: 'messages', icon: '✉', label: '消息' }`；props `pending: number` → `badges?: Partial<Record<CoachView, number>>`；badge 渲染泛化 |
| `src/features/workspace/PlanWorkspace.tsx` | ① 新增 props `me: AuthUser`；② 新增 state `conversations: ChatConversation[] \| null` / `sessionDead` / `bindLostIds` / `chatActiveId` / `chatDrafts` + ref `inboxRequest`；③ boot effect 在 `st.length > 0` 时并发拉一次 `listConversations()`；④ `:145-148` 的裸 `setInterval` 换成 `useVisiblePolling`，tick 里并发拉 `getBindRequests` + `listConversations`，频率随 `view === 'messages'` 在 60s/30s 之间切，`enabled: !sessionDead && students.length > 0`；⑤ `view` 切到 messages 的一次性强制刷新 effect；⑥ `applyConversations(updater)`（统一 bump 代际号）+ `applyReadState()`；⑦ 挂载时 `chatOutbox.setErrorSink(...)`，卸载时置 null；⑧ **两处** `CoachRail` 调用点改 `badges=`；⑨ 正常态渲染追加 `{view === 'messages' && <MessagesPage …/>}`；⑩ **空态 shell** 的降级条件加上 `messages`；⑪ 两处 shell 都渲染 `sessionDead` 横幅 |
| `src/features/workspace/ChangePasswordDialog.tsx` | 删本地 `isSessionExpired`，改 import `../../api/errors` |
| `src/features/workspace/ChangePasswordDialog.test.ts` | `:3` 的 import 拆开：`isSessionExpired` 改从 `../../api/errors` 取，其余符号仍从 `./ChangePasswordDialog` 取。断言不动 |
| `src/App.tsx` | `<PlanWorkspace onLogout={onLogout} me={user} />`（该分支里 `user` 已被 TS 收窄成非空）；`onLogout` 里加 `chatOutbox.reset()` |
| `src/index.css` | **文件末尾追加**一段 `/* Coach chat: inbox rows + thread bubbles + composer. */`：`.chat-page`（§3.2 的 flex 契约）、`.chat-row`、`.chat-dot`、`.chat-thread`（`flex:1; min-height:0; overflow-y:auto`）、`.chat-bubble`（`.mine` 变体）、`.chat-bubble p { white-space: pre-wrap; overflow-wrap: anywhere }`、`.chat-receipt`、`.chat-pending`、`.chat-more`、`.chat-composer`（`flex:0 0 auto`；`textarea { font-size: 16px }`）、`.chat-image-missing`、`.chat-unknown`、`.chat-blocked`、`.chat-session-banner`（fixed，z-index 200）。**不改任何既有选择器** |
| `src/features/workspace/PlanWorkspace.test.tsx` | 只需**新增**一条「空态 shell 下点 messages 不白屏、且没有发起 `listConversations`」（该文件现有内容对 `CoachRail` / `pending` 零引用，不存在 props 适配工作），并补一个 `me` 的假 user |

**明确不动**：`coachViewNavigation.ts`（新 tab 走同一条 `changeView` 路径，别绕过）、`ChangePasswordDialog.behavior.test.tsx`（它只 import 组件与 `PASSWORD_CHANGED_NOTICE`）、后端任何文件。

---

## 8. 验收标准

### 8.1 本地可验（Codex 必须自证，无需账号）

1. `npm run lint`（= `tsc --noEmit`）零错误；`npm test` 全绿，新增 5 个测试文件全部有断言且非 trivial。
2. `VITE_API_BASE='' npm run build` 成功；产物入口 chunk 里 `grep -c '"/api"'` = 0 **且** `grep -cF '="";if(/^http'` = 1（后者证明改 `client.ts` 没有破坏 backend CI 的 grep marker）。**这是本地前置自检，机械闸在 backend CI，不要再造第三道。**
3. `chatModel.test.ts` 覆盖回执闭区间三点（`other_last_read.seq` = 9/10/11 对 seq=10 的我方最后一条 → 已送达/已读/已读）。
4. `chatModel.test.ts` 证明 `newClientId()` 在 `globalThis.crypto.randomUUID` 被删除、以及 `crypto` 整体不可用两种环境下都返回长度 1..64 的字符串，1000 次调用无重复。
5. `chatSync.test.ts` 证明一次 `catchUpSince` 能排空三页积压，`has_more=false` 后不再发第四次请求，且 `pagesFetched === 3`。
6. `chatOutbox.test.ts` 证明 `retry` 发出的请求 body 里 `client_id` 与首次完全相同。
7. `chatOutbox.test.ts` 证明发送成功后 item 先进 `confirmed(message)` 态，只有调用 `acknowledgeConfirmed` 之后才从 `itemsFor` 消失。
8. `useVisiblePolling.test.ts` 证明：tick 挂起时把假时钟推进 10 个周期，`tick` 仍只被调用一次（单飞）；tick 返回 `20_000` 时下一拍在 20s 后而非 `intervalMs`。
9. `MessagesPage-ui.test.tsx` 证明：markRead 成功回灌后，一个**早于** markRead 采样的 `listConversations` 响应落地时红点**不复活**。
10. `MessagesPage-ui.test.tsx` 证明：进会话后**没有任何新消息到达**的情况下，仍打了一次 `POST /read`，红点清零。
11. `MessagesPage-ui.test.tsx` 证明：`keydown` 带 `isComposing: true` 的 Enter **不**触发 `sendTextMessage`；同一测试里 `isComposing: false` 的 Enter 触发。
12. `MessagesPage-ui.test.tsx` 证明：403 后输入框 `disabled` 且失败气泡没有「重试」按钮；未知 `kind` 渲染降级文案不抛错。
13. `PlanWorkspace.test.tsx` 证明：`students = []` 时切到 messages tab 渲染 `.empty-page` 而非白屏，且**没有**发起 `listConversations`。

### 8.2 需 staging 教练账号（David 或 `/testacct` 造号后走查）

> Claude/Codex 不取 Bitwarden 密码；这一段由 David 跑或授权造号。

14. 教练网页开着消息 tab + 线程，学员在 iOS 发一条中文文本 → **≤5 秒**内出现在网页消息流，rail 红点同步清零，且学员 iOS 端在 ≤3 秒内看到「已读」。
15. 教练在网页发一条 → 学员 iOS ≤3 秒收到；网页气泡从「发送中」**不闪断地**转正文，回执显示「已送达」，学员点开后转「已读」。连发 5 条同样不出现气泡集体闪没。
16. **中文输入法实机**（macOS 上 Safari + Chrome 各一次）：用拼音打「明天把深蹲降到 RPE7」，在候选窗开着时按 Enter 选词 → **不发送**；上屏后再按 Enter → 发送一条完整消息。学员端只收到一条完整消息。
17. **多行 + 长串折行**：发一条含三个换行的消息、一条 300 字符无空格 ASCII 串 → 网页气泡内正确换行；消息流自己出现纵向滚动条、composer 始终可见；整页 `document.documentElement.scrollWidth` 不变。
18. **积压追平（组件不卸载）**：把浏览器标签页最小化 5 分钟，期间学员连发 60 条 → 切回标签页，一次追平循环内全部到齐、无缺号、seq 严格连续。
19. **积压重入（组件卸载）**：切到「计划编写」tab 5 分钟，期间学员连发 60 条 → 切回消息 tab，首屏拿到最新 50 条并滚到底，点「加载更早消息」能补齐剩余 10 条、无缺号。（这条与 18 是两条不同代码路径，别合成一条断言。）
20. **重试幂等**：断网状态下发一条 → 气泡「发送失败」→ 恢复网络点「重试」→ 学员端**只收到一条**。
21. **图片只读**：学员 iOS 发一张图 → 网页正确渲染缩略图；会话列表预览显示 `[图片]`；停留 >15 分钟后刷新页面，图片仍能显示（续签生效）。
22. **发起对话**：对一个从未开口的学员用「＋ 发起对话」→ 进入空线程 → 发一条 → 学员 iOS 收到。对一个**已有会话**的学员重复选中 → 直接打开原会话，不产生第二个会话。
23. **红点跨 tab**：教练停在计划编写 tab，学员发消息 → ≤60 秒内 rail 的消息 tab 出现红点。
24. **草稿与选中态存活**：在某会话里敲半句中文不发送 → 切到计划编写 tab → 切回消息 tab → 仍停在该会话，半句草稿还在输入框里。
25. **已读不越权**：教练网页开着某会话，鼠标键盘完全不动 3 分钟，期间学员发一条 → 网页消息流会显示这条（轮询照跑），但**不打已读**：学员 iOS 端不显示「已读」，教练自己的 iPhone 上该会话红点仍亮。教练回来**点一下页面**（或按键 / 滚动 / 让窗口重新获得焦点）→ 5 秒内转「已读」、手机红点清零。

    > ⚠️ 措辞要紧：交互判定监听的是 `pointerdown / keydown / wheel / focus / scroll`，**`mousemove` 不在内**——
    > 单纯移动鼠标不算交互，走查时照「动一下鼠标」的字面做会误判成 bug（2026-07-27 踩过）。
    > 这是有意为之：鼠标划过屏幕不代表人在读消息，加 `mousemove` 会削弱这道防线。
    > 另注 `document.hasFocus()` 也是硬闸——浏览器窗口不在最前时，点了也不会打已读。
26. **限流余量（双浏览器 tab）**：A tab 停在计划编写并持续改动触发 autosave，B tab 停在消息 tab + 线程，持续 3 分钟 → 无 `rate_limited` 可见症状（保存不出现分钟级挂起、消息不出现分钟级延迟）。
    （单个 tab 里做不到「编辑器 + 消息同时活着」——`PlanEditor` 只在 `view === 'editor'` 挂载，切走即卸载、autosave 控制器随之消失。）

### 8.3 review 闸

- 亲读全量 diff；`/review-loop` 收敛到 CLEAN 才开 PR。
- **Codex 作业不 commit / 不 push**，git 与 PR 一律由 Claude 收口。

---

## 9. 分卡建议（每卡一个可 review 的原子 diff）

| 卡 | 级 | 范围 | 文件 | 验收 |
|---|---|---|---|---|
| **C1 数据层** | T1 | 零 UI、零渲染：wire 类型、API 薄封装（含 `retryRateLimit` 开关）、纯函数模型（含 `newClientId`）、追平循环 | 新增 `src/api/chat.ts`、`src/api/errors.ts`、`src/features/chat/chatModel.ts`、`chatSync.ts`；改 `src/api/types.ts`、`src/api/client.ts`、`ChangePasswordDialog.tsx`、`ChangePasswordDialog.test.ts`；新增 `chatModel.test.ts`、`chatSync.test.ts` | §8.1 的 1/2/3/4/5 |
| **C2 tab 落位 + 只读会话列表** | T1 | rail 泛化、`me` 下传、顶层轮询 hook、boot 首拉 + 进 tab 强刷、未读红点、空态降级、消息 tab 渲染「会话列表 → 只读线程首屏」（无增量轮询、无已读、无翻页、无发送） | 新增 `useVisiblePolling.ts`、`MessagesPage.tsx`（首版）；改 `CoachRail.tsx`、`PlanWorkspace.tsx`、`App.tsx`、`index.css`（列表 + 气泡 + `.chat-page` flex 契约）、`PlanWorkspace.test.tsx`；新增 `useVisiblePolling.test.ts` | §8.1 的 8/13 + §8.2 的 23；教练能看到历史消息，只是不自动更新、不能回 |
| **C3 活起来** | T2 | 5s `since_seq` 增量 + 追平 + 翻页数反馈调度、翻历史（按钮 + 滚动锚定）、已读四闸（首屏 + 每拍，single-flight + 回滚）、回执渲染、红点回灌与统一 `applyConversations` 防复活、inbox 提速到 30s、401 自保（sessionDead + 跨 tab 横幅 + 停表） | 改 `MessagesPage.tsx`、`PlanWorkspace.tsx`、`index.css`；新增 `MessagesPage-ui.test.tsx` | §8.1 的 9/10 + §8.2 的 14/18/19/25 |
| **C4 发送** | T1 | `chatOutbox` 单例（含 confirmed 交接 + errorSink）、composer（**IME 守卫 + 草稿上抛**）、三态气泡、重试幂等、403/409/429 分支、`App.tsx` 的 reset | 新增 `chatOutbox.ts`、`chatOutbox.test.ts`；改 `MessagesPage.tsx`、`PlanWorkspace.tsx`、`App.tsx`、`index.css`（composer 段） | §8.1 的 6/7/11/12 + §8.2 的 15/16/20/24 |
| **C5 边界打磨** | T0 | 图片续签 + `图片暂不可用`、未知 kind 降级、`＋ 发起对话`（含 403 置灰）、`useClockTick` 相对时间自刷新、文案终稿、折行 CSS 复核 | 改 `MessagesPage.tsx`、`useVisiblePolling.ts`、`index.css` | §8.2 的 17/21/22 |

**顺序强制串行**（C2 依赖 C1 的类型，C3/C4 依赖 C2 的组件骨架）。同一 worktree 只挂一个 Codex 作业。

**上线**：本仓改动不触发任何部署——plan-web 上线是后端侧的手工 web-swap（从干净 worktree `VITE_API_BASE='' npm run build` → dist 全量替换进 backend `web/` → 落 `staging` 出镜像 → `gh workflow run deploy-staging.yml -f migrations_applied=true` → `db/MIGRATIONS-APPLIED.md` 追加一行）。**后端已就绪，本波零迁移。**

---

## 10. 待 David 拍板（不阻塞开工，按上面的默认值先实装）

1. **消息 tab 在 rail 的位置**：默认追加末尾（不动既有五个 tab）。是否上移到第二位（消息是高频）？
2. **轮询节奏**：默认会话 5s / inbox 30s（消息 tab 打开）·60s（未打开）+ 不可见即停 + 追平后自适应退让。这里除了限流预算，还有**服务端查询放大**：`GET /conversations` 无分页、每条会话 5 次 DB 查询，且 §6.2 的死会话永不消失（N 只增不减）。带 30 个学员时 30s 轮询 ≈ 150 次查询/分钟。是否接受？「后端零改动」这个前提大概到多少学员规模就该复议？
3. **已读的产品口径**：默认「页面可见 + 窗口有焦点 + 近 120 秒有交互」才打。更保守的一档是「只在教练主动点开该会话时打一次，轮询批次一律不打」。另外 iOS 侧同样有「切 tab / 盖 sheet 时照打已读」的口子——要不要把「已读 = 用户确实看到了」立成双端统一口径（那是 iOS 的独立改动）？
4. **全局 401 兜底通道**是否单开一张 T1 卡先落？它在**已发布**的 plan-web 上就存在（autosave 永久失败 + 60s 轮询吞 401），不是聊天引入的；单卡改动面 = `client.ts` 加回调 + `App.tsx` 订阅 + `LoginScreen` 一句文案 + 2 个测试，聊天波直接继承。
5. **文本长度口径三端统一**（iOS 字素簇 / zod UTF-16 / PG 码点）：本卡靠 `maxLength` 规避，但 iOS 发 emoji 长消息仍会 400。统一成哪一套？
6. **会话列表 `preview` 后端截断**（现在整条 4000 字下发，每条会话都背）：要不要在后端加 120 字符截断？属破坏性 wire 变更，需与已发的 1.0(14) 对齐。
7. **教练侧死会话**：W1 用「花名册弱闸 + 双向 403 硬闸」。二期是否给 `fetchConversationWire` 加 `is_active`（additive-safe，iOS 解码不破）让死会话能收进「历史」分组？
8. **切 tab 成本**：聊天把「切 tab」从偶发变成高频，而 `changeView` 每次离开 editor 跑 leave guard 冲刷草稿、每次回 editor 跑 `loadPlan` 全量重取。W1 不改（消息做成独立 view 与其它五个 tab 完全同构，最省心且零回归面）。若实测切换体感差，二期是否把消息改成侧栏/抽屉（不占 view，不触发 leave guard）？
9. **从学员上下文一键发消息**（看板/编辑器/视频里点某个学员 →直接开会话）：W1 明确不做（§1.2）。教练真实工位上想发消息时 100% 正看着那个学员，这个入口的价值可能高于会话搜索——排 W2 还是更早？

---

## 评审处置

四份评审共 20 条 blocker、25 条 nit。**全部 blocker 已按评审改**，落点索引见下；未按原样采纳的条目单列理由。

### blocker → 落点索引

| 评审 blocker | 落点 |
|---|---|
| `crypto.randomUUID` 线上必炸、单测抓不到（3 份评审同时提） | §2.1 现状 + §4.5 `newClientId` + §8.1/4 |
| `POST /conversations` 的 403 无 UI 出口 | §2.3 契约补两个 403 产地 + §3.6 + §6.2 发起侧硬闸 + §6.5 |
| boot effect 不拉 conversations → 首屏假空态 | §2.1 现状 + §4.2 首屏两条 + §3.2/§6.3 的 `null` 加载态 |
| `openConversation` 不 bump 代际号 → header TypeError | §4.4 统一 `applyConversations` 闸 + §3.4 线程自持快照 |
| `useVisiblePolling` 无单飞、`setInterval` × 6 分钟退避正反馈 | §4.2 自调度契约 + 不退避通道 + §8.1/8 |
| 已读只看 `visibilityState`，挡不住「可见但无人看屏」 | §4.4 四闸 + §5 偏差表重写 + §8.2/25 |
| `onConversationsChanged` 传整份数组绕开代际闸 | §4.1 updater 形式 props |
| 发送成功后 message 无处交接，气泡闪没 | §4.5 `confirmed` 交接态 + §8.1/7 + §8.2/15 |
| 首屏路径没挂 markRead → 红点永不清 | §4.3 首屏分支 + §8.1/10 |
| `.chat-page` 与 `.data-page` 的 overflow 冲突 | §3.2 布局契约 + §7 index.css 条目 |
| `ChangePasswordDialog.test.ts` 漏进清单 → C1 必挂 | §7 修改清单第 6 条 |
| 401 无传导通道（props 缺两个方向） | §4.1 props + §6.1 传导通道 |
| 401 横幅挂在教练看不见的 tab | §6.1 横幅提到 `coach-shell` fixed 层 |
| 中文输入法 Enter 误发 | §3.5 IME 守卫 + §8.1/11 + §8.2/16 |
| composer 草稿 / `activeId` 切 tab 即丢 | §4.1 归属表 + §3.5 + §8.2/24 |

### 未按原样采纳 / 部分采纳

1. **「轮询批次一律不打已读，只在主动打开会话时打一次」（评审 2 的更保守方案）** —— 部分采纳。仍在轮询批次打，但加了窗口焦点 + 120s 交互闸。理由：完全不打会让「教练确实盯着屏幕聊天」这个主场景的已读回执迟到到下一次点击，学员端体感倒退；交互闸已经把「离席替手机清红点」这个不可恢复的破坏性写堵住了。保守档作为备选写进 §10/3 待拍板。
2. **「inbox 提速到 30s 还是维持侦察建议」** —— 采纳 30s（草稿是 15s）。同时把服务端查询放大与死会话累积写进 §4.2 与 §10/2，而不是只登记不改。
3. **「消息 tab 改侧栏/抽屉以规避切 tab 的 leave guard + loadPlan 成本」（评审 4 nit）** —— 不做。W1 消息做成与其它五个 tab 完全同构的 view，是回归面最小、与 `072866a` 先例一致的形状；改抽屉要动 `coachViewNavigation` 与两处 shell 的布局，属于全局导航改动，超出单 tab 范围。登记进 §10/8，等实测体感再定。
4. **「会话列表加搜索/过滤」（评审 4 nit）** —— 不做。内测教练学员数个位数到 20 出头，一屏扫得完；按姓名定位由 §3.6 的「＋ 发起对话」下拉承担（选中已有会话的学员直接打开该会话，`POST /conversations` 幂等），不需要第二套 UI。写进 §1.2 非目标。
5. **「§7 明确不动 `client.ts`」** —— 推翻草稿自己的约束，改为「可动，但限定范围」。不给轮询一条不退避通道，429 一旦发生就会被 6 次 × 最长 60s 的退避链锁住并持续偷走恢复中的预算，这是评审 2/3/4 共同指出的正反馈根因。加参数不触及 `configuredApiBase`，backend 的两条 grep marker 不受影响，§8.1/2 加了本地自检。
6. **「`ChangePasswordDialog.tsx` 保留一行 re-export」（评审 3 给的二选一）** —— 选另一支：改测试 import。re-export 会留下两个看起来都合法的真相源，与「去重」这个改动的初衷相反。
7. **「`maxPages = 20` 重算预算 / 给追平循环封每分钟页数上限」** —— 采纳但换了机制：`maxPages` 降到 10，并让追平循环把翻页数反馈给调度器换算下一拍延迟（§4.2）。滑动窗口配额需要 outbox 之外再维护一份状态且难测；反馈式退让只多一个返回值，且 `useVisiblePolling` 已有测试覆盖。
8. **「`§8.2/16` 单 tab 内 autosave 与聊天共存不可执行」** —— 采纳并顺带修正 §4.2 里「与 autosave 的常态 ~24 req/min 同处一个桶」的表述：单 tab 内两者永不共存，真实竞争只发生在双 tab 或同 NAT 下的 iOS，验收 26 已按此改写。
9. **「iOS 侧切 tab/盖 sheet 照打已读」「后端 XFF 可伪造绕过限流」「小写 `rate_limited` vs iOS 大写枚举」「`GET /conversations` 加分页」** —— 均确认属实但不在本卡范围（前两条是 iOS/backend 的独立卡，后两条是后端改动，与「后端零改动」前提冲突）。第一条已从 §5 偏差表里删掉那句错误辩护并改写成登记项；其余不在本 spec 内展开。