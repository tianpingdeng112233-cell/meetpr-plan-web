# 001-plan-editor-web · 教练计划网页编写端

**Status:** Design (brainstorm 冻结，待拆实现计划)
**Date:** 2026-06-25
**App:** `apps/meetpr-plan-web`（暂不建 git 仓库，开工时再 init）

## Goal

给教练一个**类 Excel 加强版的网页计划编辑器**，承接 xty 这类教练「在 Excel 里写力量举计划」的习惯，但产出是**结构化数据**：写完直接落进 MeetPR 后端现有的计划树（`plans → plan_days → plan_exercises → plan_sets`），学员在 iOS app 里照常看到、逐组打卡、回流数据。

网页是后端计划的**第二个编写入口**——教练用 app 写或用网页写，落进同一个学员、同一份结构化计划。**后端零改动复用**：001 登录、002 计划 CRUD、exercises 动作库。

事实基准：教练 xty 真实计划表（吕子豪.xlsx）+ 记号系统解码（见 memory `meetpr-coach-plan-dsl`）。

## 非目标 / V1 明确不做

- **百分比(%top) 强度模式** —— 后端 `intensity_mode` 只支持 `weight`/`rpe`；%top 要做对需引入"训练最大值(TM)"子系统才能让学员端可用。V1 不做，教练写 % 处先填重量或留备注。
- **「注意事项」整页**（热身激活/RPE量表/营养计算器）—— 后端无模型，砍掉。
- **Excel 文件导入（.xlsx 上传解析）+ 多动作同格拆分** —— 复用同一套解析逻辑，但版式识别 + 一格多动作拆分是额外工作 → 排 **V1.1**。V1 编写态里一行一个动作，不处理同格多动作。
- PDF/图片导出、跨学员模板库、实时协同。

## 架构

新建网页应用，技术栈照搬 `apps/meetcard`：**React 18 + Vite + TypeScript + Tailwind**。纯前端 SPA，通过 REST 调 MeetPR 后端。无自建后端。

### 六个模块（各自独立、可单测）

1. **Auth/Session** — 教练用后端账号登录（复用 001 `/auth`），拿 JWT access token；前端存储 + 给每个请求带 `Authorization: Bearer`。仅 `coach` 角色。
2. **API Client** — 包一层后端端点（typed）：
   - `GET /coach/students`（花名册）· `GET /students/:id/plans` · `GET /plans/:id`（带 children）
   - `POST /plans` · `PATCH /plans/:id` · `POST /plans/:id/publish`
   - days/exercises/sets 的 POST/PATCH/DELETE（002 的八条嵌套路由）
   - `GET /exercises`（动作库，客户端缓存）· `POST /exercises`（建自定义）
   - ⚠️ 后端 `Decimal` 是 **JSON 字符串**（`"180.5"`），收发都当字符串处理，不转 number。
3. **强度逐组模型 + DSL Parser**（走 TDD）— V1 编写态核心是**结构化逐组框**（组数→N框，kg/RPE 由 chip 定，见 §强度列），不依赖解析。DSL Parser 是纯函数，服务两处：①编写态**可选快填**（爬坡/广播/粘贴串 → 拆进框）②**V1.1 导入** xty 存量 Excel 紧凑串。解析不掉的尾巴降级成 `plan_exercise.notes`。详见 §解析规则。
4. **Calendar Grid UI** — **连续滚动**：所有周完整铺开、竖向堆叠在一个滚动区里，上下滑看前后周（像 Excel 一条长表，不折叠）。每周内部=7 天同排一屏、不横向滚动（休息日窄列、训练日平分剩余宽度）；每天一格=日期+星期 header + 五列小表（动作｜组｜次｜强度｜备注）。
   - **当前周指示**：因主屏整张 `transform:scale` 缩放、`position:sticky` 在 transform 祖先下失效，"现在在第几周"由**缩放层之外**的一个吸顶条显示（监听滚动位置算出当前周写进顶部条），不靠周内 sticky 标签。
5. **Exercise Binding（即时联想）** — 教练在「动作」列边打边联想，命中 catalog → 绑真 `exercise_id`；变式/tempo 自动拆（节奏深蹲310 → 动作=节奏深蹲 + tempo 310 进备注）；未命中 → 就地 `POST /exercises` 建自定义（`created_by_coach_id=自己`）。**一行 = 一个动作**（不在一格里塞多个动作；多动作同格只属 V1.1 导入，见 §非目标）。
6. **Week Ops（上下文动作）** — **选中某一天**触发上下文动作条：复制上周到本周 / 加动作 / 设为休息 / 清空本日。复制语义见 §复制上周。无全局"复制某周"、无"批量+kg"按钮。

## UI / 布局（已对原型冻结）

- **顶栏**：学员选择 ▾ · 计划名 ▾ · 草稿/已存状态 · 发布按钮
- **工具栏**：计划名 · 周期 · 缩放读数+提示 · 跳到周。**当前第 N 周**指示（缩放层之外、随滚动更新）。
- **主屏**：连续滚动，所有周竖向堆叠（像 Excel 长表）；每周内 7 天同排铺满一屏宽，每天一格五列小表
  - 列：`动作`（主，可联想，带 `✓库`/`自定义`/`备注` 角标）｜`组`｜`次`｜`强度`｜`备注`
  - **休息日 = 窄列**（不占等宽、竖排"休息"），把宽度让给训练日，避免次数/强度被截断
  - **列宽可拖拽（像 Excel）**：5 列共享一组宽度（全局列），拖任一天列头右边界 → 所有天同列联动；表格宽=列宽之和，超出视口则**横向自动扩充**（横向滚动 + 中键平移）。逐组重量挤了拖宽强度列即可，§强度列的换行只作兜底。
  - 顶栏/工具栏吸顶；上下滑看前后周
  - **表格缩放（手势，只放大）**：缩放下限=100%（一周刚好占满容器宽度，不允许更小、不留空白），上限约 220%。Ctrl+滚轮 / 触控板捏合（macOS Chrome 捏合=ctrlKey 的 wheel；Safari/触摸屏走 gesture 事件）；放大后按住鼠标中键拖动平移。无 －/＋ 按钮。整张表 transform:scale 等比缩放。
- **选中某天** → 上下文动作条：复制上周到本周 · 加动作 · 设为休息 · 清空本日。（不设全局"复制某周"/"批量+kg"按钮）
- 要求：全周期纵向连续可滚（看前后周）；一周默认尽量一屏，但**列宽可拖拽 + 横向自动扩充**（不再强制不横滚——拖宽换横滚是值得的取舍）。

## 强度列（逐组填，默认）

后端 `plan_sets` 是**每组一行**——所以强度**从一开始就逐组填**：组数 N → 强度格展开成 **N 个小框**，教练每组直接填一个值。重量、RPE 都一样逐组填，不是先打简写再展开。

**模式 chip 决定框里值的含义**（解决 `9` 是 9kg 还是 RPE9 的歧义）：每行强度带 `kg`（默认）/ `RPE` chip。
- **kg 模式**：每框 = 该组重量，落 `intensity_mode='weight'`，`target_value`=框值（>0，舍入 0.5kg）。例：`80 / 85 / 90 / 90`。
- **RPE 模式**：每框 = 该组 RPE(1.0–10.0)，落 `intensity_mode='rpe'`，`target_value`=框值。例：`6 / 7 / 8 / 8`。

逐组框是**唯一事实来源**，永远可逐组改。框数随组数联动（改组数 → 增减框，新框默认复制前一框值）。

**布局**：强度格内逐组框一行放不下时**自动换行**（多到 5 组、含小数重量如 62.5 时折成两排），整行变高，所有组都看得见、不截断——优先保证"每组可见"而非"挤在一行"。

**可选快填**（便利，不是必须，填完即写进那些框、仍可改）：
- 广播：填一个值 → 铺满所有框（全组同重 / 同 RPE）。
- 爬坡封顶 `起→止 步进`（步进显式，不推断）：`80→90 +5` 铺成 `80/85/90/90`；卧推 `62.5→70 +2.5`。
- 粘贴逐组串 `120/125/130/135` 或 `6788` → 拆进各框（个数/位数应等于组数，不符提示）。

「组数」N + 「次数」R → N 条 plan_set，每条 `target_reps=R` + 对应框的强度。

> 注：V1 编写态核心是这套**结构化逐组框**（快、无歧义）。把 xty 存量 Excel 的紧凑串（`4*8 D80/L90 递增5kg`）解析进框，是 **DSL Parser 在 V1.1 导入**的活；编写态的快填只复用其中的简写解析。

### set_type 展开规则（解决"`4*8 amrap` 是哪一组 amrap"）

- 默认所有生成的 set `set_type='working'`。
- 行级标记（`amrap`/`力竭`/`降组` 来自备注或专用标记）**默认只打在最后一组**（最常见：顶组 AMRAP / 末组回退）；`力竭`→`failed`、`amrap`→`amrap`、`降组/回组`→`backoff`。
- 展开后逐组的 set_type **可见且可逐组改**（教练当场看到"机器读到的逐组结果"，要全组 amrap 这类突发情况自己点）。不静默猜死。
- 可变次数（amrap 那一组）用 `target_reps`（下限）+ 可选 `target_reps_max`。

### 无强度 / 自由文本行（解决辅助动作落库）

辅助动作常只有「动作 + 组×次」甚至纯文字（徒手 塑造发力），没有可结构化的强度。规则：

- **强度格为空** → 该 `plan_exercise` **不生成任何 plan_set**（后端允许 exercise 下 0 组）；把"组×次 + 自由文本"写进 `plan_exercise.notes`（如 `4×12 · 徒手 塑形`）。学员端按备注展示，不逐组打卡。
- 想要结构化逐组打卡 → 教练给该行填一个强度（kg 或 RPE）即可，按上面规则展开。
- **绝不**为了凑 set 而伪造 `target_value`（不 trust、不造数据）。

**优先级（强度空 vs set_type 标记）**：`set_type` 标记只能挂在**已生成的 set** 上。所以——有强度（有 set）+ amrap/降组 → 按 §set_type 规则打到对应 set；强度空（0 set）+ amrap 等文字 → 该文字并入 notes，**不产生** set_type（无 set 可挂）。如 xty 的 `无腿卧推 2*12 amrap rpe9` 本身带 RPE9，应填 RPE 强度→2 组 RPE9、末组 amrap（不是 notes-only）。

## 解析规则（DSL → 后端字段）

来源记号系统见 memory `meetpr-coach-plan-dsl`。下表是 **V1.1 导入 + 编写态快填** 用的解析映射（编写态默认是逐组框直填，不经解析）：

| 教练写法 | 落库 / 拆进框 |
|---|---|
| 组数 `4` × 次数 `8`（**强度可解析时**） | 生成 4 条 plan_set，各 `target_reps=8`；强度为空则 0 组（见 §无强度行） |
| 强度(kg) 爬坡快填 `80→90 +5` | 铺成 4 框 80/85/90/90（封顶+0.5舍入，见 §强度列） |
| 强度(kg) 逐组 `120/125/130/135` | 拆进 4 框 |
| 强度(RPE) 逐组串 `6788` | 拆进 4 框 6/7/8/8 |
| `amrap` / 力竭 / 降组 | `set_type` 默认打**最后一组**（amrap/failed/backoff），逐组可改，见 §set_type 展开规则 |
| tempo `310` / 长暂停2S | 进 `plan_exercise.notes`（后端无 tempo 字段） |
| 主项变式名带 tempo（节奏深蹲310） | 动作名绑 catalog「节奏深蹲」+ tempo 入 notes |
| 强度格为空的辅助（徒手/塑造发力 4×12） | `plan_exercise` 0 组 + 组次&文本入 notes，见 §无强度行 |

一行 = 一个动作；**多动作同格不在 V1 解析范围**（属 V1.1 导入）。

解析不确定时：**当场把"机器读到的逐组结果"显示在行内**，教练能立刻发现并改（解析可靠性是质量 gate，宁可让教练确认也不静默猜错）。

## 复制上周（高危写操作，定边界）

- 触发：选中某天 → 上下文条「复制上周到本周」。作用域 = 选中日**所在那一周**整周。
- **第 1 周禁用**（无上一周），按钮置灰。
- 源 = 上一周（week_number-1）的全部 day→exercise→set；目标 = 当前周。**整周覆盖**（先删目标周现有 days 再克隆源周），不做合并/追加（避免动作重复堆叠）。
- 目标周**非空**时弹**确认框**（"将覆盖第 N 周现有 X 天内容"），默认不覆盖；空周直接复制不打扰。
- 复制后**可撤销**（一步 undo 还原目标周到复制前快照）。
- 复制只在本地 draft model 进行，再按 §数据流 reconcile 到后端。

## 数据流

1. 教练在格子里填/改 → 本地结构化 model（draft 态）。
2. 动作列联想 → 绑 `exercise_id`（或建自定义）。
3. 自动存草稿：把本地 model reconcile 到后端计划树（建/改/删 day→exercise→set）。`plan.status='draft'`。
4. 点发布 → `POST /plans/:id/publish` → 学员 iOS 端可见、开始打卡。

## 鉴权与归属

- 仅 `coach` 登录。所有写操作经后端既有的 SQL 级 owner 校验（coach 必须拥有 root plan）。网页不绕过、不自建权限。
- 学员数据只读来源 = `GET /coach/students` / `GET /students/:id/plans`。

## 错误处理 / 降级

- 解析不出结构 → 不阻塞打字，整行降级为 `notes`，UI 标「备注」角标。
- 动作未命中 catalog → 提示建自定义，不静默丢。
- 后端写失败 → 草稿保留在本地，标记未同步，可重试（不丢教练输入）。
- Decimal 一律字符串往返。

## 测试

- **强度逐组模型**：TDD，组数↔框数联动（增框默认复制前值）、kg/RPE 模式落库、0.5kg 舍入、amrap/backoff/failed 默认末组+逐组可改、空强度→0组+notes。这是 V1 核心。
- **DSL Parser（快填/导入）**：TDD，覆盖每条记号拆进框（爬坡封顶边界+缺步进报错、逐组串位数/个数校验、tempo 入 notes）。
- **API Client**：mock 后端，验证 Decimal 字符串往返、owner 404、reconcile 增删改、0 组 exercise 落库。
- **Grid UI**：整周渲染、逐组框直填、复制上周（第1周禁用/非空确认/撤销）、休息日窄列、缩放下限100%、当前周指示、角标。

## 开放/后续

- 实现期确认后端花名册端点确切路径（`GET /coach/students`）。
- V1.1：.xlsx 导入（复用 parser + 加版式识别）。
- V2：%top + 训练最大值子系统；注意事项页。

## Refs

- 后端 002-coach-planning-crud（计划树 + 端点 + owner 校验）· `0003-init-plans.sql`（plan_sets 约束：intensity_mode∈{weight,rpe}, set_type∈{warmup,working,failed,amrap,backoff}）
- 001-auth（JWT）· exercises catalog（GET/POST，`created_by_coach_id` 可见性）
- memory `meetpr-coach-plan-dsl`（xty 记号系统事实基准）
- 原型：`apps/meetpr-plan-web/specs/001-plan-editor-web/`（HTML 原型见 `.superpowers/brainstorm/meetpr-coach-web-prototype.html`）
