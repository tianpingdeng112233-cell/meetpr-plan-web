# 教练网页定稿字标 · 2026-11-27

分支 `feat/wordmark-final`，基线 `origin/main@1ed36ec`。开工时已在指定 worktree 创建并删除临时文件，沿用已安装的依赖。

TopBar、CoachShell 顶栏、登录页和入驻页页头共用 `Wordmark`。图片高度 24px，宽度按 SVG 比例计算，可访问名称为 MeetPR。TopBar 保留 56px 单行和分隔线，入驻页字标仍链接到首页，登录页保留 COACH。移除了旧图标的方形背景、宽度与圆角样式。

## 验证记录

| 命令 | 结果 |
| --- | --- |
| `npm test -- Wordmark.test.tsx TopBar.test.tsx`（实现前） | 10 通过、1 失败，另有 1 文件因组件尚不存在而未收集。失败断言实际收到旧 PNG。 |
| 同一命令（实现后） | 2 个文件，12 通过、0 失败。 |
| `cmp docs/design/wordmark-final/meetpr-wordmark-final.svg public/meetpr-wordmark.svg` | 逐字节一致。 |
| `npx tsc --noEmit` | 退出码 0。 |
| `npm run build` | 退出码 0，Vite 提示 JS chunk 超过 500 kB。 |
| `npm test`（首次全量） | 1647 通过、6 失败。5 个入驻页用例把新增页头图计入二维码，已将选择器限定到二维码。另有拼音性能用例耗时 13006ms，阈值 1000ms。 |
| `npm test -- src/features/onboarding/onboarding.test.tsx src/features/plan-editor/pinyin.test.ts --no-file-parallelism` | 24 通过、4 失败。3 个入驻页异步用例达到默认 5s 超时，拼音性能用例超过阈值。 |
| `npm test -- --maxWorkers=2 --minWorkers=1`（修正二维码断言后全量） | 1652 通过、1 失败。入驻页 21 项全过。唯一失败是拼音性能用例（2981ms）；匹配实现、字表和用例均与基线一致。 |
| `npm test -- src/features/plan-editor/pinyin.test.ts` | 单跑 7 通过、0 失败，性能用例 934ms。 |
| `npm test -- --no-file-parallelism`（最终全量） | 128 个文件、1653 项全部通过，0 失败。使用原测试阈值。 |

## 收货说明

本地 Vite 尝试监听 127.0.0.1:5197 时返回 `listen EPERM`。浏览器截图、四处实际显示比例及 TopBar 单行视觉验收留给卡片指定的 Opus 收货环节。

按共用规则记下现有文案位置。LoginScreen 的入驻登录提示、OnboardingPages 的页头与申请标题含「内测」，设备选择、install.tsx 的安装区含「安卓」，iPhone 安装说明含「TestFlight」。

## Opus 收货（2026-11-27）
- 读全量 diff：只换四处品牌位，SVG 与定稿逐字节一致（cmp）。
- 本地 dev（5191）亲眼看四处：登录页、计划编辑顶栏（单行未溢出）、/coach 引导页、教练工作台顶栏（用临时 harness 渲染真实 CoachShell，已删）。实测字标 96.9×24。截图见 `wordmark-final-web-evidence/`。
- 注意（未改，报 David）：网页 /coach 引导页文案含「内测入驻」「申请成为 MeetPR 内测教练」。
