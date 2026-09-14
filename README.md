# meetpr-plan-web

MeetPR 教练计划网页编写端。教练在电脑浏览器里给学员写训练计划，写完一键发布，学员在 MeetPR iOS App 里立刻看到并逐组打卡。

编辑器用周带组织训练日，支持逐组强度/重量和从 `.xlsx` 导入存量计划。部署后的网页与 iOS App 连接同一个后端；结构化计划树是学员可见内容的来源。

面向对象：给一两个教练用的内部工具，不是公开产品。终端用户使用说明见 [`docs/教练使用指南.md`](docs/教练使用指南.md)。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 框架 | React 18 (`^18.3.1`) |
| 构建 | Vite 5 (`^5.4.11`) |
| 语言 | TypeScript (`~5.6.3`)，`tsc --noEmit` 做类型检查即 lint |
| 样式 | Tailwind CSS 3 (`^3.4.15`) |
| 测试 | Vitest 2 + jsdom |
| xlsx 解析 | SheetJS (`xlsx` from CDN tarball) |

UI 使用当前浅色主题及暗色变体：颜色/圆角/字体通过 CSS 变量在 [`src/index.css`](src/index.css) 定义，Tailwind 做映射（见 [`tailwind.config.js`](tailwind.config.js)）。组件使用语义 token，配色以对应主题的变量值为准。

---

## Quick start

```bash
npm install
npm run dev        # 起 Vite dev server，端口 5180
```

打开 http://localhost:5180 。dev server 将 `/api/*` 代理到 `http://127.0.0.1:3000`，默认需要本地后端。通过 `.env.local` 中的 `MEETPR_DEV_BACKEND_TARGET` 选择其他获准环境；配置读取见 [`vite.config.ts`](vite.config.ts)。远端环境的登录、写计划和发布会影响该环境的真实数据，测试账号指针见 `CLAUDE.md`。

```bash
npm test           # vitest run，跑一遍全部单测
npm run test:watch # watch 模式
npm run lint       # tsc --noEmit，类型检查（本仓库没有独立 ESLint）
npm run build      # tsc --noEmit && vite build，产物进 dist/
```

---

## 部署

**后端同源 serve**（2026-07-04 起）：站点由 MeetPR 后端直接 serve（`express.static('web')` + 内容协商 SPA fallback），教练**免 VPN** 访问 **http://121.40.160.241:3000/**。

- 从已验证的 `main` 构建 `VITE_API_BASE='' npm run build`，将产物换入后端 `web/`（同源，无需 `/api` 代理）；后端 PR 合入 `staging` 后，等待该 SHA 的 build-push 完成。按 backend `deploy-staging.yml` 和迁移账本执行部署，再核对线上页面入口哈希与 API；SAE 控制台是 fallback。
- ⚠️ **Vercel 方案（`meetpr-plan-web.vercel.app`）已弃用**：其 `/api/*` 代理明文 HTTP 后端已坏（502）。2026-07-09 起该域名已改为纯 307 跳转到正式入口（redirect-only 部署，不在本仓）；仓内 `api/proxy.js`、`vercel.json`、`deploy` 脚本已删，**别再对本仓跑 `vercel --prod`**（会把跳转覆盖回死代理）。
- 本地开发：`npm run dev` @ 5180。dev 代理默认指向 `http://127.0.0.1:3000`（本地后端）；要直连线上后端，设 `MEETPR_DEV_BACKEND_TARGET=http://121.40.160.241:3000`（`.env.local` 或环境变量，明文 HTTP 会有警告）。

> 分支已归一到 `main`（2026-07-04，`origin/HEAD → main`，默认分支即生产血脉）；仅剩 `feat/002-xlsx-import` 死血脉退休中。细节见 [`CLAUDE.md`](CLAUDE.md) §①「分支现状：双血脉已解」。

---

## specs/ 目录索引

功能规格按编号存在 [`specs/`](specs/)，是编辑器行为的事实基准：

| 编号 | 目录 | 内容 |
|------|------|------|
| 001 | [`specs/001-plan-editor-web/`](specs/001-plan-editor-web/) | 计划网页编写端主规格（长表编辑器、动作绑定、保存/发布）+ `DESIGN-BRIEF.md` |
| 002 | [`specs/002-coach-plan-xlsx-import/`](specs/002-coach-plan-xlsx-import/) | 从教练 `.xlsx` 导入存量计划 |
| 003 | [`specs/003-draft-autosave/`](specs/003-draft-autosave/) | 草稿自动保存（1.5s 自动存草稿） |
| 045 | [`docs/specs/045-coach-plan-shift.md`](docs/specs/045-coach-plan-shift.md) | 教练后移推荐日期、撤销最近批次；上线依赖 backend 0070 与 gate |

2026-09-14 收尾状态：web #99 配套修复已部署；web #101、backend #276、iOS #340/#341/#342 尚未合并。本轮 web 本地测试与构建已通过，后移入口的线上迁移、gate 和换装尚未执行。具体验证与最终提交以 PR 记录为准。

---

## 目录结构

```
src/
  api/                  后端对接：auth / plans / exercises / invite / client
  data/
    exercise-aliases.json   动作别名表副本（详见 CLAUDE.md）
  features/
    auth/               登录
    workspace/          学员/计划切换外壳
    plan-editor/        长表编辑器主体
      exerciseIndex.ts      动作绑定索引（catalog + 别名 → 动作 id）
      autosave.ts           草稿自动保存
      reconcile.ts          发布/更新时按天 diff
      import/               xlsx 导入解析
docs/
  教练使用指南.md        给教练的终端用户说明
specs/                  001 / 002 / 003 功能规格
vite.config.ts          dev server + 代理 + vitest 配置
```
