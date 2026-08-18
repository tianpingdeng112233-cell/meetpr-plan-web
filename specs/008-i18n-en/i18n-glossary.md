# MeetPR i18n glossary

This glossary is the translation source of truth for the iOS app. Prefer the terms below over
literal translations so StudentKit, CoachKit, and the shared modules use the same training
language.

## Exercise names

- Display the current exercise catalog's `nameEn` verbatim in English. Do not translate an
  exercise name from its Chinese `name` at the call site.
- The bundled catalog currently contains 1,219 entries; the preview repository adds four
  synthetic competition lifts. Counts may change, but `nameEn` remains canonical for every
  catalog-backed exercise.
- Synthetic competition lifts use these established names: `Competition Squat`, `Competition
  Bench Press`, `Competition Conventional Deadlift`, and `Competition Sumo Deadlift`.
- Examples from the catalog: `暂停深蹲` → `Pause Squat`; `节奏卧推` → `Tempo Bench`.

## Powerlifting and programming

| 中文 | English | Usage note |
|---|---|---|
| 力量举 | powerlifting | Lowercase in prose. |
| 深蹲 | squat | Use catalog `nameEn` for a named exercise. |
| 卧推 | bench press | Use `bench` only where space is tight. |
| 硬拉 | deadlift | Use catalog `nameEn` for stance variants. |
| 三大项 | the big three | Squat, bench press, and deadlift. |
| 主项 | main lift | |
| 主项变式 | main-lift variation | |
| 辅助项 | accessory | `accessory exercise` when the noun needs to be explicit. |
| 组 | set | |
| 次数 | reps | Avoid `times`. |
| 重量 | weight | |
| 训练负荷 | training load | |
| 训练容量 | training volume | Use `volume` in compact charts. |
| 容量负荷 | volume load | Weight × reps × sets. |
| 强度 | intensity | |
| 训练频率 | training frequency | |
| 组间休息 | rest between sets | `rest timer` for the feature. |
| 热身 | warm-up | Noun/adjective; `warm up` as a verb. |
| 工作组 | working set | |
| 顶组 | top set | |
| 减载组 / 回退组 | back-off set | Hyphenated. Do not use `drop set`. |
| 力竭组 | set to failure | |
| AMRAP | AMRAP | As many reps as possible. Keep the acronym in UI. |
| RPE | RPE | Rating of perceived exertion. Keep the acronym in UI. |
| RIR | RIR | Reps in reserve. Keep the acronym in UI. |
| 1RM | 1RM | One-rep max. |
| 估算 1RM | e1RM | Estimated one-rep max. Keep lowercase `e`. |
| 训练最大值 | training max (TM) | Do not conflate with e1RM. |
| 最佳纪录 | personal record (PR) | Use `PR` in compact UI. |
| 追平最佳纪录 | matched PR | |
| 刷新最佳纪录 | new PR | |
| 处方 / 计划目标 | prescription | Set-level target. |
| 实际完成 | actual result | |
| 自主调节 | autoregulation | |
| 次数区间 | rep range | |
| 重量建议 | weight suggestion | |
| 递增 | progression | `increase` for a single numeric action. |
| 周递增 | weekly progression | |
| 顺延 | shift | Product action that moves the plan forward; do not use `postpone`. |
| 周期 | cycle | Use `training cycle` if context is ambiguous. |
| 微周期 | microcycle | |
| 中周期 | mesocycle | |
| 大周期 | macrocycle | |
| 训练块 | training block | |
| 积累期 | accumulation phase | |
| 强化期 | intensification phase | |
| 实现期 | realization phase | |
| 肌肥大期 | hypertrophy block | |
| 力量期 | strength block | |
| 峰值期 / 备赛峰值期 | peaking block | |
| 减载 | deload | Cycle recovery microcycle. |
| 赛前减量 | taper | Distinct from a deload. |
| 停练 | training cessation | Distinct from a taper. |
| 恢复 | recovery | |
| 疲劳 | fatigue | |
| 准备度 | readiness | Use for the daily athlete check-in. |
| 功能性过度训练 | functional overreaching | |
| 最低有效容量 | minimum effective volume (MEV) | |
| 最大适应容量 | maximum adaptive volume (MAV) | |
| 最大可恢复容量 | maximum recoverable volume (MRV) | |
| 维持容量 | maintenance volume (MV) | |
| 训练日志 | training log | |
| 训练历史 | training history | |
| 完成率 | completion rate | |
| 连胜 | streak | |
| 漏练 | missed workout | |
| 教练反馈 | coach feedback | |
| 训练视频 | training video | |
| 视频打点 | video marker | `Add marker` for the action. |
| 标注帧 | annotated frame | |

## Common UI

| 中文 | English |
|---|---|
| 保存 | Save |
| 取消 | Cancel |
| 确定 | Confirm |
| 完成 | Done |
| 删除 | Delete |
| 重试 | Retry |
| 发送 | Send |
| 跳过 | Skip |
| 继续 | Continue |
| 返回 | Back |
| 关闭 | Close |
| 编辑 | Edit |
| 添加 | Add |
| 搜索 | Search |
| 筛选 | Filter |
| 清空 | Clear |
| 全部 | All |
| 今天 | Today |
| 当前 | Current |
| 暂无 | None yet |
| 加载中 | Loading |
| 刷新中 | Refreshing |
| 已完成 | Completed |
| 未完成 | Not completed |
| 已送达 | Delivered |
| 已读 | Read |
| 未读 | Unread |
| 登录 | Sign in |
| 注册 | Sign up |
| 退出登录 | Sign out |
| 手机号 | Phone number |
| 密码 | Password |
| 隐私政策 | Privacy Policy |
| 使用数据说明 | About usage data |
| 网络不稳定,重试 | Network connection is unstable. Try again. |
| 请求失败,请稍后重试 | Request failed. Try again later. |

## Style

- Use sentence case for English labels and messages.
- Keep `kg`, `RPE`, `RIR`, `AMRAP`, `1RM`, `e1RM`, `PR`, and `SBD` unchanged.
- Use an en dash for ranges in prose where practical, and retain multiplication signs in compact
  prescriptions such as `100 kg × 5`.
- Preserve punctuation and wording in every `zh-Hans` value exactly as the pre-localization Swift
  literal. Localization must not rewrite Chinese copy.
