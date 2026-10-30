# 016 · 卡 B（返修）— 去掉「绑定关系」tab，用户详情改为绑定记录、不显示计划

先读仓根 `CONTEXT.md`、`CLAUDE.md`、`specs/016-admin-redesign/SPEC.md`（§1、§6、§7、验收 1/9/11 已于 10/22 改版）、`specs/016-admin-redesign/design/UserDetail.dc.html`（新版稿 ⑤），以及 `docs/CODEX-JOURNAL.md` 末段 016 卡 A 的交付记录。在本 worktree 分支 `feat/014-admin-redesign` 上、卡 A 已提交的代码之上做。

## 目标
1. 左栏去掉「绑定关系」，删 `BindingsPage` 及其导航、文案、测试；`getAdminBindings` 保留（详情页要用）。
2. 用户详情：删「相关计划」卡与「名下学员 / 绑定教练」卡，换成一张「绑定记录」卡，规则见 SPEC §6（数据来自 `GET /admin/bindings` 按该用户过滤；全部状态；按发起时间倒序；整行进对方详情；标题旁「生效 N · 共 N 条」）。详情页不再渲染任何计划字段。
3. 中英文案同步增删。

## 文件范围（预计）
`src/features/admin/AdminWorkspace.tsx`、`src/features/admin/AdminWorkspace.test.tsx`、`src/i18n/strings-admin.ts`、`src/i18n/en-smoke.test.tsx`（如引用到绑定页）。

## 约束
不改后端、不加依赖、不改锁文件；不 commit、不 push、不开 PR；其余卡 A 行为不回退。

## 测试 seam（先红后绿）
`AdminWorkspace.test.tsx`：先改断言跑红——左栏四项无「绑定关系」；用户详情无计划文本、绑定记录含待处理/已过期等状态且排序与计数正确、点击行进入对方详情。原绑定页测试删除，其中仍适用的断言（状态标签文案）迁到详情页用例。

## 验收
SPEC 016 验收清单 1、9、11、12、13。

## 交付
在 `docs/CODEX-JOURNAL.md` 追加「016 卡 B」一段：改动文件、红 → 绿证据、lint / 测试 / build 结果、拿不准的地方。
