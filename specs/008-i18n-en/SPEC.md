# SPEC 008 — plan-web 全站英文化(runtime locale)

## 目标

美国教练能用纯英文界面在 plan-web 完成「登录 → 写计划 → 发布 → 看学员数据 → 聊天/看视频」全流程;中国教练看到的界面与今天**逐字节一致**。单一构建产物,同一份 dist 同时服务国内(阿里云 SAE 同源)与海外(DO App Platform 同源)。

## 机制(已定,不要另起方案)

1. 新建 `src/i18n/` 模块:
   - `locale.ts`:`resolveLocale(): 'zh' | 'en'` — `navigator.language` 以 `zh` 开头(不区分大小写,含 `zh-CN`/`zh-Hans-CN` 等)→ `'zh'`,否则 `'en'`。提供 `setLocale(l)` 显式覆盖(测试与未来手动切换用);模块内单例,首次读取后缓存。
   - `strings.ts`:集中字典。形态 = 两个同构对象 `zh` / `en`,TypeScript 用 `satisfies` 保证键集合一致(en 缺键编译报错)。带插值的条目写成函数,如 `weekN: (n: number) => \`第\${n}周\`` / `(n) => \`Week \${n}\``。
   - 导出 `S`(当前 locale 的字典)与 `fmt` 辅助。组件里 `S.saveDraft` 直接替换原字面量。
2. 允许按 feature 拆文件(如 `strings-plan-editor.ts`)避免单文件几千行,但 locale 解析只有一处。
3. vitest:在 `vite.config.ts` 的 `test` 块加 `setupFiles: ['src/test/i18n-setup.ts']`,该文件调用 `setLocale('zh')` —— **现有测试的中文断言必须全部原样通过,一条不改**(jsdom 默认 `navigator.language` 是 `en-US`,不钉死会翻车)。另加一个 en smoke 测试:`setLocale('en')` 下渲染登录页与 PlanEditor 顶栏,断言无 CJK 字符泄漏(正则 `/[一-鿿]/`)。

## 五条纪律(红线,与 iOS 英文化卡同源)

1. **zh 逐字节不变**:所有中文 UI 字符串搬进字典时必须与现文件逐字节一致(含标点、空格、全半角)。中国教练今天看到什么,明天还看到什么。登录页现有的双语占位符(如 `手机号或邮箱 / Phone or email`)zh 侧原样保留,en 侧写纯英文。
2. **线格式 locale 稳定**:发给后端的任何值(动作 canonical 名、day_of_week、日期串、错误码、DSL 解析记号)不随 locale 变化。**动作绑定(exerciseIndex/别名表)永远 key 在 catalog 的 zh `name` 上,en 只换显示层**——`name_en ?? name` 仅用于渲染,绝不参与绑定、去重、排序键、请求体。
3. **术语查表**:翻译先查 `specs/008-i18n-en/i18n-glossary.md`(iOS 正典拷贝);动作名英文以 catalog `name_en` 为准,不自造。表里没有的新术语按表内风格补,并在 PR body 列出新增条目。
4. **豁免**:代码注释、`src/mock/`、测试文件内的中文断言、`docs/`、`教练使用指南.md` 不翻。`src/features/plan-editor/sampleData.ts`(样例模式数据)**要翻**——美国教练第一次接触很可能是样例模式,样例数据不是线格式。
5. **数字/日期呈现**:en 下周几用 `Mon/Tue/...`,日期用 `Aug 18` 风格;zh 现有格式逐字节保留。kg 单位两边都是 `kg` 不动。

## 范围

`src/` 下约 42 文件 / 1069 行含中文 UI 字符串(mock/data/测试/注释已除外),大头:PlanEditor.tsx(108)、VideosPage.tsx(79)、CustomExerciseDialog.tsx(74)、catalogModel.ts(73)、DayColumn.tsx(64)、MessagesPage.tsx(60)、CatalogPage.tsx(60)、AdminWorkspace.tsx(57)、ContextRail.tsx(51)。用 `grep -rP '[一-鿿]' src --include='*.ts' --include='*.tsx'` 自查,交付时上述范围内(豁免项除外)不得残留字面量中文。

`index.html` 的 `<title>` 与 meta 保持中文不动(单一产物无法按 locale 分;deferred)。

## 验收

- `npm run lint`、`npm run build`、`npm run test` 全绿;现有测试零改动零跳过(新增 setupFiles 与 en smoke 除外)。
- en smoke:登录页 + PlanEditor 顶栏无 CJK 泄漏断言过。
- zh 逐字节:审查者将抽查字典 zh 值与 git 历史原字面量 diff。
- 不改任何请求体/解析逻辑:`reconcile.ts`、`import/`、`exerciseIndex.ts` 的行为性 diff 应为零(仅显示层字符串替换)。
