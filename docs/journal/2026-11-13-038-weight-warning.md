# 038 网页教练重量偏差

- David 原话：「如果学员选择了和教练发布不一致的重量用红色凸显一下」，随后确认仅教练查看、平台网页端。依据 docs/SPEC-038.md 的 2026-11-13 修订执行；T1/P1，五个生产文件，单展示模块，无 API/数据/迁移。
- 基线 origin/main `90678bd30efcb74a22fbb5cf0c2c4779bf686f73`，独立工作树 fix/coach-weight-warning。iOS 探查草稿已归档，没有提交或安装 App；最终仅交付网页。
- 固定/逐组重量由 ±5kg 容差改为数值不等即红；区间含边界；优先按日志 set_index 读取已发布逐组处方，旧行无原始处方时沿用网格目标。空值、自重、自选和额外组不误报。力竭/未完成与强度配色规则保留。
- 展开行保留目标格及原有实际重量×次数 chip；总览切到实际时只将重量摘要标红，展开可定位具体偏差组。

## 验证

- 先红后绿：固定目标小偏差、区间刚越界、稀疏日志比错首组、总览重量强调、逐组原始区间映射。日志在本次工作区 work/web-red-*.log / web-green-*.log。
- 最终 `npm test`：122 文件 / 1538 项通过。`npm run lint`、`VITE_API_BASE='' npm run build` 与 `git diff --check` 通过。Vite 原有大 chunk 提示保留。
- 独立 Standards：初审 CLEAN，原始处方补丁定向复审 CLEAN。
- 独立 Spec：初审发现逐组区间误用首组，补 mapExercise → actualWeightTone 回归并修正；定向复审 CLEAN。全量复跑暴露旧自加组 fixture 没带实际处方字段，补齐 200kg/RPE8 的真实原始处方，最终全量通过；未降低断言。
- 本机 Chrome 隔离浏览器加载真实 PlanEditor、现有 CSS 和合成 API 数据：固定 100→97.5/102.5 红、100 正常；100–110 区间内105正常/99.5与110.5红；漏首组时45对应第二组正常、47.5对应第三组50红。总览只有重量红，次数/RPE保持。两种主题设置下均检查，当前表格沿用既有浅色界面；零 pageerror。未登录真实账号、未写真实计划或发送消息。
- 截图：[逐组](../evidence/038-weight-warning/sets.png)、[总览](../evidence/038-weight-warning/overview.png)。自动设计扫描只报原有 CSS 边框/阴影规则，无本次新增项。

## 交付

- [PR #165](https://github.com/tianpingdeng112233-cell/meetpr-plan-web/pull/165) 已合并，web main SHA `1d2e980c2b9a8163543e9c01c5791dbb59758a23`。本仓无 GitHub Actions CI；上述源码本地门禁与独立审查通过。
- David 随后明确要求「合并部署」。从上述 SHA 构建生产同源产物，保留现有 TestFlight / Android 安装链接，经 [backend PR #402](https://github.com/tianpingdeng112233-cell/MeetPR-backend/pull/402) 合并至 staging；实际部署镜像 `4d54e038773571a0ff50751e6ec85e3e7bde9976`，仅国内 SAE。
- 后端 PR CI、合并后 CI 与镜像构建均绿；[部署 run 43363239954](https://github.com/tianpingdeng112233-cell/MeetPR-backend/actions/runs/43363239954) 于 2026-11-13 成功，health/login/同源入口门禁通过。线上 HTML/JS/CSS 与验收构建逐字节匹配，build ID `1794541359771`。
- Chrome 使用线上真实资源和隔离 API fixture 复验固定重量、区间边界、缺组和总览/展开全通过，零 pageerror；未登录真实账号、未写真实记录或发送消息。
- 产物 SHA256、部署/回滚信息与线上截图集中记于 [后端本卡 JOURNAL](https://github.com/tianpingdeng112233-cell/MeetPR-backend/blob/docs/record-web-weight-warning-deployment/docs/journal/2026-11-13-web038-weight-warning-deployment.md)。后端运行代码、数据库、env 与海外部署未变。
