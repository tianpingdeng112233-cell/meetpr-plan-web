# 021 · 卡 A — 学员栏数据层（接口客户端 + 学员栏模型），不含界面

先读仓根 `CONTEXT.md`（「解绑」「在训学员 / 已解绑学员」「学员备注」「学员栏」是本卡新词）、`CLAUDE.md`，再完整读 `specs/021-student-rail-unbind/SPEC.md`——它是唯一验收口径。后端契约见 `~/Projects/apps/MeetPR-backend/specs/057-coach-unbind-alias/SPEC.md`（只读参考）。分支 `feat/021-student-rail-unbind`（基于 `origin/main`），worktree `meetpr-plan-web-wt-021`，依赖已装好（npm）。

## 为什么先拆这张、为什么同分支
屏幕稿尚未「定稿」，界面卡（卡 B）等稿；接口客户端与学员栏排序/搜索模型不依赖布局，先做。卡 B 在同一分支续做、合成一个 PR，所以本卡只加不接线（新代码暂不被界面调用是预期的）。

## 目标
1. `src/api/coach.ts` 及其类型：
   - `CoachStudent` 追加可选字段 `alias`、`bond_status`（`'active' | 'ended'`）、`ended_at`、`today`（`{ state: 'completed' | 'scheduled' | 'rest'; completed_at: string | null } | null`）、`pending_video_count`。全部可选——后端 057 未部署时旧响应照常可用。
   - 花名册读取支持 `include_ended`（新函数或参数，现有 `refreshCoachStudents()` 调用方行为不变）。
   - 新增 `unbindCoachStudent(id)` → `POST /coach/students/:id/unbind`；`setCoachStudentAlias(id, alias: string | null)` → `PATCH /coach/students/:id` body `{ alias }`。
   - `CoachBindRequest` 追加可选 `previously_ended_at`。
2. 新建学员栏模型纯函数（建议 `src/features/workspace/studentRailModel.ts`，位置可按现有结构调整）：输入花名册 + 搜索词，输出 `{ active: Row[]; ended: Row[] }`（或等价结构），实现 SPEC §1 的全部规则：
   - 显示名 = `alias ?? display_name`；有备注时带本名副标题。
   - 状态文案键：「HH:MM 完成」/「今日未练」/「休息日」（时间按浏览器本地时间格式化，与现有总览一致；文案走仓内 i18n 现有机制含繁体）。
   - 排序：已完成按 `completed_at` 升序 → 有安排未练 → 休息；后两组按显示名拼音升序（复用 `src/features/plan-editor/pinyin.ts` 或其底层字表，不另引依赖）。`today` 缺失（旧后端）时一律归到第 3 组按拼音排，不报错。
   - 搜索：匹配备注名、本名、拼音全拼、拼音首字母；已解绑命中单独返回，供界面放在「已解绑」标题下。
   - 已解绑行带 `ended_at` 用于「解绑于 MM/DD」。
3. 「老学员」标签判定：给一个纯函数 `previouslyEnded(request)` → `MM/DD | null`，卡 B 接线用。

## 约束
- 不改任何现有组件与界面行为；不接线到 `TopBar` / `PlanWorkspace` / `CommandPalette`（卡 B 做）。
- 守仓内 `tsc --noEmit` 配置（唯一事实源是仓内配置）。
- 不 commit、不 push、不开 PR、不改锁文件。

## 测试 seam（先红后绿，红要实际跑出来）
1. 学员栏模型测试（主力，与模型文件同目录 `*.test.ts`）：三组排序（含「一天多次完成取最早」由后端给出，前端只按 `completed_at` 排）、组内拼音序、备注名/本名/全拼/首字母四种命中、已解绑归组（含分组收起时搜索命中仍返回）、旧后端无 `today` 字段的兜底、无命中空结果。
2. `src/api/coach.test.ts`：`unbindCoachStudent`、`setCoachStudentAlias`（含 null 清除）、`include_ended` 的请求路径与 body 各一条。
3. 全量 `npm test` + `npm run build`（= `tsc --noEmit && vite build`）全绿。

## 交付
写 `docs/journal/2026-11-02-021-card-a.md`（一卡一文件；卡 B 另开文件）：改动文件、红 → 绿证据（命令 + 数字）、全量测试与 build 结果、给卡 B 的接线要点（函数名、返回结构）、与 SPEC 不一致或拿不准的地方。
