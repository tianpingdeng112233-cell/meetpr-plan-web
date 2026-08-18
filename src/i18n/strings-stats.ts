import type { Translations } from './types'
import { countUnit } from './plural'

export const zhStats = {
  capacity: { title: '本周计划容量', subtitle: (plan: string, week: number) => `${plan} · 第 ${week} 周`, loading: '计划容量加载中…', empty: '暂无计划容量数据' },
  roster: { completionLow: '完成率低', preMeet: (weeks: number) => `赛前 ${weeks} 周`, pendingPreMeet: (weeks: number) => `待排 · 赛前 ${weeks} 周` },
  context: {
    profileLoading: '画像载入中…', profileMissing: '学员未填写画像', profileSuffix: '· 画像', unnamedExercise: '未命名动作',
    recordsLoading: '训练记录载入中…', recordsFailed: '记录载入失败', noRecords: '暂无训练记录', repsPr: '次数 PR', imported: ' 导',
    latest: (date: string) => `最近一次 · ${date}`, lastPrefix: '上次', failureSuffix: ' 力竭', recentSets: (sets: number, count: number) => `${sets} 组 · 最近 ${count} 次`,
    topSet: (value: string) => `顶组 ${value}`, squatE1rm: '深蹲 e1RM', benchE1rm: '卧推 e1RM', deadliftE1rm: '硬拉 e1RM',
    registered1rm: '登记 1RM', rollingE1rm: 'e1RM · 滚动', noData: '暂无记录', latestTopSet: '最近一次顶组',
    ratioE1rm: '本次 ÷ e1RM', pinRight: '改为固定在右缘', followSelection: '改为跟着选中日', close: '关闭上下文栏',
    setsReps: (sets: number | string, reps: number | string) => `${sets} 组 × ${reps} 次`, loadingProfile: '载入训练档案…', profile: '学员画像', importedShort: '导',
    latestShort: '最近一次', trainingSetsRecent: (sets: number) => `${sets}组训练 · 最近记录`, noSetRecord: '暂无该组数记录',
    repsBest: (reps: string) => `${reps} 次最好成绩`, repsBestShort: (reps: string) => `${reps} 次最好`, historyRecent: (sets: number, reps: number) => `${sets}×${reps} 历史 · 最近 2 次`, noMatchingRecord: '暂无组×次匹配记录',
    onboarding: '学员画像 · ONBOARDING', basics: '基础', years: '年限', style: '风格', selfReport: '自报', injuries: '伤病',
    competition: '备赛', levelMissing: '未填级别', notCompeting: '暂不备赛',
  },
  board: {
    e1rmBackend: 'e1RM · 后端滚动值', registered1rm: '登记 1RM', weightRatioE1rm: (weight: number) => `${weight} ÷ e1RM`, playSetVideo: '播放该组视频', allStudents: '全部学员',
    pending: '待排', attention: '需关注', overview: '学员总览', filter: '学员筛选', levelWeight: '级别 / 体重',
    completionRate: '完成率', weeklyVolume: '周总量', meetDistance: '距赛', nextWeekPlan: '下周计划', notRegistered: '未报名',
    planned: '已排', planNextWeek: '排下周 ↵', noMatchingStudents: '暂无符合条件的学员', dashboard: '学员看板',
    recentTraining: '● 最近训练', profile: '画像', weightClassMissing: '未填级别', noCompetition: '暂无备赛计划', noInjury: '无伤病备注',
    lastFourWeeks: '近 4 周', attendance: (days: number) => `出勤 ${days} 天`, completion: (rate: string) => `完成率 ${rate}`,
    searchExercise: '搜索动作…', repsPr: '次数 PR', date: '日期', lastSixTopSets: '近 6 次顶组 RPE', recentExecution: '近期执行',
    selectExercise: '选择动作查看档案', athlete: '学员', rpe: 'RPE', e1rm: 'e1RM', unread: (count: number) => `${count} 条未读`,
    days: (count: number) => `${count} 天`, sessions: (count: number) => `${count} 次`, measuredTitle: (lift: string, date: string) => `${lift}最新实测 e1RM · ${date}`,
    trendAria: (trend: string) => `趋势${trend}`, noMeasuredOrRegistered: (lift: string) => `${lift}尚无实测或登记值`, registeredNoMeasured: (lift: string) => `${lift}登记值,尚无实测`,
    preparing: (date: string, weightClass: string) => `备赛 ${date} · ${weightClass}`, attendanceOf: (trained: number | string, planned: number | string) => `出勤 ${trained} / ${planned} 天`,
  },
  tracking: {
    noData: '暂无数据', backendOld: '后端版本过旧', e1rmTrend: 'e1RM 趋势', last90Competition: '近 90 天竞技主项估算',
    gapHint: '虚线 = 中间隔了无记录周', newData: '新数据', intensityShare: '按已完成训练组强度占比', repsShare: '按实际完成次数占比',
    intensityDistribution: '强度分布', repsDistribution: '次数分布', bigThreeVolume: '三项容量占比', last90Volume: '近 90 天总容量占比',
    volume: '容量', dashboard: '追踪看板', tracking: '追踪', last90Days: '近 90 天', loadFailed: '追踪数据加载失败，切换学员或刷新页面重试',
    loading: '加载追踪数据…', volumeTrend: '容量趋势', weeklyTonnage: '每周训练容量（吨）', averageRpe: '平均 RPE 趋势',
    averageRpeHint: '有 RPE 训练组的周均值', intensityTrend: '强度趋势', topSetE1rm: 'Top set，占 e1RM %',
    bodyweight: '体重', bodyweightTrend: '体重趋势', noBodyData: '暂无体态打卡数据', wellnessPending: '等待 wellness 数据源接入',
    weekLabel: (date: string) => `${date} 周`, comparedStart: (value: string) => `较起点 ${value}`,
    e1rmChart: (lift: string) => `${lift} e1RM 折线图`, lineChart: (lift: string, metric: string) => `${lift}${metric}折线图`, barChart: (lift: string, metric: string) => `${lift}${metric}柱状图`,
    tonnes: (value: string) => `${value} 吨`, setShare: (percent: string, count: number) => `${percent}% · ${count} 组`, volumeShareChart: (lift: string) => `${lift}容量占比横条图`,
  },
} as const

export const enStats = {
  capacity: { title: 'This week’s planned volume', subtitle: (plan, week) => `${plan} · Week ${week}`, loading: 'Loading planned volume…', empty: 'No planned volume data' },
  roster: { completionLow: 'Low completion rate', preMeet: (weeks) => `${countUnit(weeks, 'week', 'weeks')} to meet`, pendingPreMeet: (weeks) => `Needs programming · ${countUnit(weeks, 'week', 'weeks')} to meet` },
  context: { profileLoading: 'Loading profile…', profileMissing: 'Athlete has not completed their profile', profileSuffix: '· Profile', unnamedExercise: 'Unnamed exercise', recordsLoading: 'Loading training records…', recordsFailed: 'Records failed to load', noRecords: 'No training records', repsPr: 'Rep PR', imported: ' Imported', latest: (date) => `Latest · ${date}`, lastPrefix: 'Last', failureSuffix: ' Failure', recentSets: (sets, count) => `${countUnit(sets, 'set', 'sets')} · Last ${count}`, topSet: (value) => `Top set ${value}`, squatE1rm: 'Squat e1RM', benchE1rm: 'Bench press e1RM', deadliftE1rm: 'Deadlift e1RM', registered1rm: 'Registered 1RM', rollingE1rm: 'e1RM · Rolling', noData: 'No records', latestTopSet: 'Latest top set', ratioE1rm: 'This set ÷ e1RM', pinRight: 'Pin to right edge', followSelection: 'Follow selected day', close: 'Close context panel', setsReps: (sets, reps) => `${countUnit(sets, 'set', 'sets')} × ${countUnit(reps, 'rep', 'reps')}`, loadingProfile: 'Loading training profile…', profile: 'Athlete profile', importedShort: 'Imported', latestShort: 'Latest', trainingSetsRecent: (sets) => `${countUnit(sets, 'training set', 'training sets')} · Latest record`, noSetRecord: 'No record for this set count', repsBest: (reps) => `Best ${reps}-rep result`, repsBestShort: (reps) => `Best ${countUnit(Number(reps), 'rep', 'reps')}`, historyRecent: (sets, reps) => `${sets}×${reps} history · Last 2`, noMatchingRecord: 'No matching sets × reps record', onboarding: 'Athlete profile · ONBOARDING', basics: 'Basics', years: 'Experience', style: 'Style', selfReport: 'Self-reported', injuries: 'Injuries', competition: 'Competition', levelMissing: 'Weight class not provided', notCompeting: 'Not preparing for a competition' },
  board: { e1rmBackend: 'e1RM · Backend rolling value', registered1rm: 'Registered 1RM', weightRatioE1rm: (weight) => `${weight} ÷ e1RM`, playSetVideo: 'Play set video', allStudents: 'All athletes', pending: 'Needs programming', attention: 'Needs attention', overview: 'Athlete overview', filter: 'Athlete filter', levelWeight: 'Class / Weight', completionRate: 'Completion rate', weeklyVolume: 'Weekly volume', meetDistance: 'Meet', nextWeekPlan: 'Next week', notRegistered: 'Not registered', planned: 'Programmed', planNextWeek: 'Program next week ↵', noMatchingStudents: 'No matching athletes', dashboard: 'Athlete dashboard', recentTraining: '● Recent training', profile: 'Profile', weightClassMissing: 'Weight class not provided', noCompetition: 'No competition planned', noInjury: 'No injury notes', lastFourWeeks: 'Last 4 weeks', attendance: (days) => `Attendance ${countUnit(days, 'day', 'days')}`, completion: (rate) => `Completion ${rate}`, searchExercise: 'Search exercises…', repsPr: 'Rep PR', date: 'Date', lastSixTopSets: 'Last 6 top-set RPEs', recentExecution: 'Recent execution', selectExercise: 'Select an exercise to view its profile', athlete: 'Athlete', rpe: 'RPE', e1rm: 'e1RM', unread: (count) => `${count} unread`, days: (count) => countUnit(count, 'day', 'days'), sessions: (count) => countUnit(count, 'session', 'sessions'), measuredTitle: (lift, date) => `Latest measured ${lift} e1RM · ${date}`, trendAria: (trend) => `Trend ${trend}`, noMeasuredOrRegistered: (lift) => `No measured or registered ${lift} value`, registeredNoMeasured: (lift) => `Registered ${lift} value; no measured value`, preparing: (date, weightClass) => `Competition ${date} · ${weightClass}`, attendanceOf: (trained, planned) => `Attendance ${trained} / ${countUnit(planned, 'day', 'days')}` },
  tracking: { noData: 'No data', backendOld: 'Backend version is outdated', e1rmTrend: 'e1RM trend', last90Competition: 'Competition-lift estimates from the last 90 days', gapHint: 'Dashed line = a week with no records between points', newData: 'New data', intensityShare: 'Share of completed training sets by intensity', repsShare: 'Share of actual completed reps', intensityDistribution: 'Intensity distribution', repsDistribution: 'Rep distribution', bigThreeVolume: 'Big-three volume share', last90Volume: 'Share of total volume over the last 90 days', volume: 'Volume', dashboard: 'Tracking dashboard', tracking: 'Tracking', last90Days: 'Last 90 days', loadFailed: 'Tracking data failed to load. Switch athlete or refresh to retry.', loading: 'Loading tracking data…', volumeTrend: 'Volume trend', weeklyTonnage: 'Weekly training volume (tonnes)', averageRpe: 'Average RPE trend', averageRpeHint: 'Weekly mean for sets with RPE', intensityTrend: 'Intensity trend', topSetE1rm: 'Top set, % of e1RM', bodyweight: 'Bodyweight', bodyweightTrend: 'Bodyweight trend', noBodyData: 'No body check-in data', wellnessPending: 'Waiting for wellness data source', weekLabel: (date) => `Week of ${date}`, comparedStart: (value) => `From start ${value}`, e1rmChart: (lift) => `${lift} e1RM line chart`, lineChart: (lift, metric) => `${lift} ${metric} line chart`, barChart: (lift, metric) => `${lift} ${metric} bar chart`, tonnes: (value) => `${value} tonnes`, setShare: (percent, count) => `${percent}% · ${countUnit(count, 'set', 'sets')}`, volumeShareChart: (lift) => `${lift} volume-share bar chart` },
} satisfies Translations<typeof zhStats>
