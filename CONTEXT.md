# MeetPR plan-web 词汇表

教练网页端计划编辑器（React SPA，后端同源 serve）。本文件只收本仓特有概念的正典叫法，禁实现细节。

## Language

**待核对行（issue row）**:
编辑器网格中教练仍需处理的行，两类：未绑定（unbound，动作名没 ✓ 绑到 catalog）与待填全（bound 但组/次/强度/重量缺失或无效）。顶栏 ⚠ 芯片计数并循环定位的就是它们。
_Avoid_: 问题行、错误行、无法保存行

**零组占位（zero-set placeholder）**:
「待填全」行保存进计划树时的降级形态：保留动作 id/主辅/备注、`sets: []`。后端草稿接受它，发布门禁拒绝它。半填数字不进计划树，只活在快照里。
_Avoid_: 空动作、骨架行

**快照（pending revision）**:
整份编辑器内容的远端暂存（backend spec 044，`PUT /plans/:id/pending-revision`），与「计划树」（days/exercises/sets 结构化数据）相对。快照是恢复用的影子，树才是学员可见的正典。
_Avoid_: 远端镜像、云端草稿（口语可用，正文用「快照」）

**计划树（plan tree）**:
后端结构化存储的计划本体（days → exercises → sets），发布后学员按它训练。与快照相对。
_Avoid_: 计划数据、服务器草稿
