# 004 — 已发布计划就地编辑(动作颗粒度锁定行)

- **状态**: Draft(冻结时点 = 本 spec PR 合并)
- **日期**: 2026-07-11
- **P 档**: P1
- **权威**: 后端契约(锁规则/错误码/`has_logs`/批量端点粒度)以 **MeetPR-backend `specs/016-published-plan-exercise-mutability`** 为唯一权威;009(批量端点)0.2 修订同见 016。本 spec 只管 web 行为。
- **拍板**: David 2026-07-11 —— B 方案·动作颗粒度。恢复/保留 2026-07-01「更新计划」语义,受动作级历史锁约束;收编批次(PR #5)的「已发布 · 只读弹窗」就此裁决为过渡态。
- **代码基线(实装前现场核实)**: **PR #5(`incorporate/codex-hardening-2026-07-09`)合并后的 `main`**。§1 的「解除只读」指撤销该批次引入的 published 弹窗拒存与客户端 `PLAN_NOT_DRAFT` 闸(`assertEditableServerTree`);若开工时基线仍是旧 `main`(本就是「更新计划」行为、无上述闸),§1 为维持现状,**勿寻找并删除不存在的逻辑**。凡本 spec 提及的控件(拖排/整份后移一天/剪贴板)均指收编批次功能;基线里不存在的控件**本卡不新增**,对应规则自动空转。

## Goal

教练对**已发布计划**继续就地调整(改未来周、调未打卡的动作),唯独学员**已打卡的动作**(`has_logs`)整行冻结。打卡历史永不脱链,教练不再为改一个未来周而重写整份 12 周计划。

## 非目标

- 组级(set)颗粒度、session 内按 RPE 动态调整(归算法引擎 override 层)——见 016「不做」。
- unpublish / 复制为新草稿。
- 新增任何编辑器控件(删除天按钮、start_date/周数编辑控件等);本卡只改既有控件的锁定行为与 reconcile。
- autosave 语义变更:**published 计划仍然绝不 autosave**(spec 003 拍板保留)。改动只经显式「更新计划」推送——所见即所发,confirm 是唯一推送闸门。

## 行为

### 1. published 可编辑(相对收编批次 = 解除只读)
- 移除 handleSave 的 published 弹窗拒存、`reconcile.ts` 的 `assertEditableServerTree`(`PLAN_NOT_DRAFT`)——以服务端 016 的门为准,客户端不再自设整树闸。
- 保存按钮显示「更新计划」+ `window.confirm`(07-01 文案语义:「保存会立即改变 ta 正在看的计划」);发布按钮维持「已发布 · 不可撤回」;离开守卫覆盖「published 有未保存改动」。
- xlsx 导入到已发布计划维持禁止(现状不变)。

### 2. 锁定行(`has_logs`)与既有控件降级
- 后端 `GET /plans/:id` 每 exercise 带 `has_logs`;为 true 的行渲染**锁定态**:🔒 + tooltip「学员已打卡,此行及其组不可修改」,动作名格/逐组强度框/组次/备注全部 disabled,行删除 ✕ 隐藏。
- **编辑器行模型必须携带服务端行身份 `serverRowId`(= `plan_exercise.id`,load 时注入;新行为 null)**——锁定判断、动作级 diff、409 定位都靠它。
- 锁定行不参与「⚠ 待核对」统计,chip 循环跳转游标跳过锁定行且序号仍正确。
- 既有天级/整树控件,凡会对**含锁定行的天**产生天级删除/重排/覆盖写,或对**有任何打卡的计划**产生日历变更者,按下表降级(以基线实际存在为准):

| 控件(收编批次基线) | 含锁定行时行为 |
|---|---|
| 清空该日 | 只清未锁行;天保留,不产生天级删除 |
| 复制上周(覆盖当日/当周) | 目标含锁定行 → 禁用 + tooltip |
| 休息日转换 | 含锁定行的天禁用 |
| 行拖排(exercise 重排) | **混合天整天禁用拖排**(锁定行 `sort_order` 不可动,绕排复杂度不值) |
| 整份后移一天(shift-all) | 计划存在**任何**打卡 → 禁用(对应 016 计划级日历锁) |
| 剪贴板粘贴到某天 | 追加新行恒可;粘贴造成的「替换整天」在含锁定行的天降级为「只替换未锁行」 |

- 计划级:reconcile 对 published 计划**永不发送** `plan_patch` 日历字段(`start_date`/`end_date`/`plan_weeks`;它们只在导入流出现,而 published 禁导入——双保险,断言之)。重命名(PATCH name)恒可。

### 3. reconcile 动作级分流(混合天)
- 天分类:**无锁天**(不含 `has_logs` 行)→ 既有天级 delete+recreate 语义,009 落地后走批量通道;**混合天** → 动作级操作,**永不入批**(该天 id 不得出现在 `delete_day_ids`/`upsert_days`)。
- 混合天的动作级 diff(全部走既有逐条端点,写量小无 429 风险):
  - **行身份 = `serverRowId`**;行内容比对沿用既有 canon(exerciseId/isMain/组次/强度/备注;**不含 sort_order**——混合天禁拖排,顺序是不变量,见下)。
  - **身份对账(每次保存必跑,两阶段,吸收半成功/响应丢失)**:`getPlan` 取 live baseline 后,混合天内——**阶段一**:所有 `serverRowId` 仍存在于 baseline 的 desired 行,先各自认领其 baseline 行(id 优先权高于内容);**阶段二**:id 为 null 或已不在 baseline(前次 DELETE 成功 + recreate 失败的孤儿)的 desired 行,按 **canon 内容匹配**认领**剩余未被认领**的 baseline 行(canon 相等;多候选取 `sort_order` 最小)——认领到 = 前次写已落库,采纳其 id、**零写**(新行 POST 成功但响应丢失由此免重复);认领不到 → 视为新行。两阶段防止孤儿行抢走合法重复动作行的 baseline 配对。对账后:内容变化的已认领未锁行 → **行级 delete + recreate**(DELETE exercise 级联删其 sets → POST exercise + POST sets;不引入 PATCH 客户端方法);未认领 desired 行 → POST;baseline 剩余未认领的未锁行 → DELETE。
  - **`sort_order` 分配(混合天禁拖排 ⇒ 所见即所存)**:锁定行 `sort_order` 永不写。recreate/替换行**逐槽复用**本次被删除未锁行释放的 `sort_order`(先 DELETE 后 POST,无冲突);仅**纯追加**、以及替换数量超出释放槽位的溢出行,取该天现存 `max(sort_order)` 起递增**尾部追加**——编辑器在编辑时即按此规则渲染行位置(溢出行立即显示在天末),保证「保存后零顺序跳变」。单测断言渲染顺序 == 保存后 `sort_order` 顺序。
  - **锁定行零写请求**;保存前本地校验「锁定行 canon 未被改动」,改了(理论上 UI 已挡死)→ 行级标错并阻断保存,不发必败请求。
  - 顺序:batch(无锁天)先行、其返回树为新 baseline;混合天逐条随后,每天内 DELETE → POST。
- **部分成功/重试收敛**:每次保存 = `getPlan` live baseline → 身份对账 → 只补差。中途失败(网络/5xx/409)后重存,已落库的写被对账认领、不重复;DELETE 成功 + POST 失败的行被对账降级为新行重建。不引入额外重试状态机。
- `changedDays` = 批量路径 + 逐条路径之和;`skippedRows` 计法不变。

### 4. 409 处理(竞态兜底,按错误码分作用域合并)
任一 409 后先 `getPlan` 拉新树作新 baseline(新 `has_logs`/已成功写入的行/`serverRowId` 以它为准,经 §3 身份对账重绑),再按码定 server-wins 作用域;作用域外的本地未保存编辑一律保留(local-wins,由下次保存收敛)。未保存标志保持 true,保存世代(`unsavedRef`)按既有机制推进,不得出现「409 后显示已保存」。

| 错误码(016/009 契约) | details 字段 | server-wins 作用域与提示 |
|---|---|---|
| `EXERCISE_HISTORY_IMMUTABLE`(逐条 exercise/set 写) | `exercise_ids` | 仅所指行:服务端内容覆盖 + 置锁定态,行级提示「学员刚打了卡,该行已锁定并还原」 |
| `DAY_HISTORY_IMMUTABLE`(逐条 day 写) | `day_id` | **不整天重置**:这是「无锁天在分类后、请求到达前刚产生打卡」的正常竞态。refetch 后按新 `has_logs` 把该天**重新分类为混合天**,仅新冻结行 server-wins 置锁(行级提示),其余行本地编辑保留,由下次保存走动作级路径收敛 |
| `DAY_HISTORY_IMMUTABLE`(批量 4.0) | `day_ids` | 同上逐天重分类(整批已回滚,`upsert_days` 中其他无锁天的改动保留在本地,重存收敛) |
| `PLAN_HISTORY_IMMUTABLE`(日历字段) | 无行级 details | 本 spec 的 web 不发日历字段,理论不触;防御性处理 = 顶栏提示「计划已有训练记录,日历不可改」+ 刷新 `has_logs`,全部本地行编辑保留 |

- 收编批次的「历史已锁定 · 请新建草稿后调整」对话框文案废弃,由上述分级提示替换。

## 顺序门(真 gate)

1. **backend 016 合 staging 并部署之后**,本 spec 才可上线——严禁「web 放开、后端仍整树锁」的窗口。上线前 web 保持基线行为。
2. published 不 autosave、confirm 不移除。
3. 锁定行判断只信服务端 `has_logs` + 409,客户端不猜测打卡状态。
4. 含锁定行的天 id 永不出现在批量 payload(`delete_day_ids`/`upsert_days`)——单测断言。

## 测试

- 锁定行渲染/禁用面(名格、强度框、删除 ✕、备注);「待核对」统计跳过锁定行且 chip 游标序号正确。
- published 编辑 →「更新计划」全链路:confirm、成功写回、锁定行零写请求、published 离开守卫。
- published 导入维持拒绝;休息日转换/复制上周/拖排/shift-all 按 §2 表逐项禁用断言(基线存在者)。
- reconcile 分流:混合天不入批(断言 `delete_day_ids`/`upsert_days` 不含其 day id);混合天行级 CRUD(改未锁行=DELETE+POST、新增=POST、删未锁行=DELETE、锁定行零请求);无锁天维持天级替换。
- reconcile 对 published 永不带 `plan_patch` 日历字段(断言)。
- 本地锁定行改动阻断保存;409 三码 → 行级提示 + 三方合并(冻结行 server-wins 还原、其余本地编辑保留、重绑 serverRowId、未保存标志不假绿)。
- 部分成功后重存收敛(身份对账):①新行 POST 成功但响应丢失(本地 `serverRowId` 仍 null)→ 重存内容认领、零写、无重复行;②DELETE 成功 + recreate POST 失败(本地持已消失的旧 id)→ 重存降级为新行重建;③**对抗用例**:同天两行 canon 完全相同,一行 id 有效、一行是孤儿 → 两阶段对账后有效 id 行保住自己的配对,孤儿认领剩余行,无误删无重复;④`sort_order`:替换逐槽复用、溢出与纯追加尾部、锁定行永不写,渲染顺序 == 保存后顺序(锁定行前/后、多行替换各一用例)。
- 409 竞态重分类:无锁天入批后刚产生打卡 → 批量 `DAY_HISTORY_IMMUTABLE` → 该天重分类为混合天、仅新冻结行还原置锁、其余本地编辑保留、重存走动作级路径;逐条 day 写同规则。
- draft 含 imported-history 打卡:锁定行同规则出现在草稿。

## Refs

- MeetPR-backend `specs/016-published-plan-exercise-mutability/SPEC.md`(权威)、`specs/009-plan-days-batch/SPEC.md`(0.2 修订:冻结天不入批、步骤 4.0、web 分流测试)
- 本仓 `specs/003-draft-autosave/design.md`(autosave draft-only 拍板)
- 收编 PR #5 body 待拍板①(本 spec 即其裁决落地)
