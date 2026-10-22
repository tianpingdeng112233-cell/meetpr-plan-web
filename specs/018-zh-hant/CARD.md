# 卡 018 — 网页（教练计划编辑器）：繁体中文

先读仓根 `CONTEXT.md`、`CLAUDE.md`，再读同目录 `SPEC.md`（共用规格）与 `GLOSSARY-zh-Hant.md`，以及 `specs/008-i18n-en/SPEC.md` 了解现有 i18n 架构。

## 目标
繁体浏览器打开国内网页（教练编辑器全部页面）看到台湾用语繁体；简体、英文零变化。

## 文件范围（预期）
- `src/i18n/locale.ts`：`Locale` 扩为 `'zh' | 'zh-Hant' | 'en'`。国内域名：浏览器语言属繁体（SPEC 共识 2）→ `zh-Hant`，否则仍锚 `zh`（**不**因英文浏览器改成英文，现有锚定语义不变）；海外域名：繁体 → `zh-Hant`，其他 zh → `zh`，其余 en。`?lang=zh-Hant` 生效。
- `src/i18n/strings-*.ts`：繁体表由开发期脚本从 zh 表生成（OpenCC s2twp + 覆写表），生成文件入仓，脚本可重跑且幂等；占位符逐字校验。
- `src/i18n/stable-zh.ts` 及使用它的速记解析/动作匹配：**输入侧同时认繁体**（先把输入做繁→简规范化再走现有解析），canonical 存储仍简体。
- 动作库名称展示：繁体下显示繁体名（生成对照表）；搜索输入繁体能命中。
- API 客户端：所有请求带 `Accept-Language: zh-Hans|zh-Hant|en`（当前界面语言）。
- 日期/星期格式：繁体用「週」。
- `<html lang>` 设为 `zh-Hant` / `zh-Hans` / `en`。

## 约束
- 不改任何页面结构、布局、导航；不加语言切换 UI。
- 用户自写内容原样。
- 本仓无 CI，合并闸门靠本地全量测试：`npm test`、`npm run lint`、`npm run build`（以 package.json 实际脚本为准）全绿。

## 验收（网页相关）
SPEC 验收清单 1–5、8、9 条中网页部分。

## 测试 seam（先红后绿）
1. `src/i18n/locale.test.ts`：国内域名 + `zh-TW`/`zh-HK`/`zh-Hant` → zh-Hant；国内 + `zh-CN`/`en-US` → zh；`?lang=zh-Hant` 生效。
2. 新增 `zh-hant-smoke.test.tsx`（与 `en-smoke.test.tsx` 同型）：渲染关键页面，文本节点无简体特有字。
3. 生成产物测试：每个 zh key 都有 zh-Hant，占位符一致，覆写表每条生效。
4. 速记解析现有测试加繁体输入用例（`臥推 100x5 @8`、`相撲硬舉 3x3`、`二頭彎舉`）→ 结果等于简体输入。

## 交付
- 分支 `feat/018-zh-hant`（本 worktree），原子 commit；不 push、不开 PR、不部署。
- `docs/CODEX-JOURNAL.md` 末尾追加记录（无则新建）：改动、测试命令与结果、偏离与疑问。
