import type { Translations } from './types'
import { countUnit } from './plural'

export const zhAdmin = {
  page: { overview: '总览', users: '用户管理', bindings: '绑定关系', plans: '计划总览', exercises: '动作库' },
  role: { admin: '管理员', coach: '教练', coachedStudent: '有教练学员', selfTrain: '自主训练' },
  binding: { accepted: '已接受', pending: '待处理', rejected: '已拒绝', expired: '已过期', cancelled: '已取消' },
  planStatus: { published: '已发布', draft: '草稿', paused: '已暂停', completed: '已完成' },
  unnamed: '未设置姓名', loadFailed: '加载失败。请检查网络后重试。', clearFilters: '清除筛选', viewAll: '查看全部', template: '模板', unscheduled: '未排期',
  overview: {
    coaches: 'COACHES // 教练总数', coachesHint: '内测期全量教练', students: 'STUDENTS // 学员总数', studentsHint: (coached: number, self: number) => `有教练 ${coached} · 自主训练 ${self}`,
    bindings: 'BINDINGS // 生效绑定', bindingsHint: '当前已接受并生效', plans: 'PLANS // 已发布计划', plansHint: '当前已发布计划',
    recentUsers: '最近注册的用户', noUsers: '还没有注册用户。', recentPlans: '最近发布的计划', noPlans: '还没有发布过计划。',
  },
  users: {
    coachStudents: (count: number) => `学员 ${count} 人`, coachRelation: (name: string) => `教练：${name}`, unbound: '未绑定', search: '搜索姓名或手机号', count: (count: number) => `共 ${count} 个用户`,
    name: '姓名', role: '角色', phone: '手机号', registeredAt: '注册时间', keyRelation: '关键关系', noMatch: '没有匹配的用户。',
    rowsHint: (count: number) => `共 ${count} 条 · 内测期全量展示 · 预留「每页 50 条」分页降级`, registeredOn: (date: string) => `注册于 ${date}`, basicInfo: '基本信息',
    assignedStudents: '名下学员', bindingRelation: '绑定关系', assignedCoach: '绑定教练', adminNoRelation: '管理员账号，无绑定关系。', selfNoCoach: '自主训练学员，无教练绑定。', noStudents: '暂无绑定学员。', noCoach: '尚未绑定教练。',
    people: (count: number) => `${count} 人`, persons: (count: number) => `${count} 位`, boundOn: (date: string) => `绑定于 ${date}`, relatedPlans: '相关计划', planCount: (count: number) => `${count} 份`, noRelatedPlans: '暂无相关计划。',
  },
  danger: {
    title: 'DANGER // 管理操作', hint: '危险操作需要二次确认。操作清单后续扩充。', deactivateAccount: '停用账号', deactivateHint: '用户将无法登录，数据保留', deactivate: '停用', unbindRelation: '解绑关系', unbindHint: '解除现有绑定，双方都会收到通知', unbind: '解绑', confirmTitle: 'DANGER // 二次确认',
    deactivateTitle: (name: string) => `停用 ${name} 的账号`, unbindTitle: (name: string) => `解除 ${name} 的绑定关系`, deactivateBody: '停用后该用户将无法登录 MeetPR。历史训练数据与计划保留，可随时恢复。', unbindBody: '解绑立即生效，双方都会收到通知。', impact: '进行中的计划将暂停或失去教练访问能力，请确认影响范围。', typeToConfirm: '输入', confirmSuffix: '以确认：', confirmUnbind: '确认解绑', deactivated: (name: string) => `已停用 ${name} 的账号`, unbound: (name: string) => `已解除 ${name} 的绑定`,
  },
  bindings: {
    search: '搜索教练或学员姓名', count: (count: number) => `共 ${count} 条关系`, coach: '教练', student: '学员', status: '状态', submittedAt: '发起时间', respondedAt: '响应时间', noMatch: '没有匹配的绑定关系。', empty: '暂无绑定关系。', rowsHint: (count: number) => `共 ${count} 条 · 内测期全量展示 · 预留「每页 50 条」分页降级`,
  },
  plans: {
    allCoaches: '全部教练', selfTemplate: '模板（自主）', count: (count: number) => `共 ${count} 份计划`, name: '计划名', coach: '教练', student: '学员', status: '状态', cycle: '周期', dates: '起止日期', noMatch: '没有匹配的计划。', empty: '暂无计划。', templateDash: '—（模板）', rowsHint: (count: number) => `共 ${count} 条 · 内测期全量展示 · 预留「每页 50 条」分页降级`,
  },
  exercises: { search: '搜索动作名或类型', count: (count: number) => `共 ${count} 个动作`, name: '动作名', type: '类型', planUses: '使用计划数', coachUses: '使用教练数', noMatch: '没有匹配的动作。', empty: '暂无动作使用数据。', rowsHint: (count: number) => `共 ${count} 条 · 按使用计划数降序` },
  detail: { baseline: '基线', sameAsLastWeek: '同上周', coachEntered: '教练手填', readOnly: '只读视图 — 管理员不能编辑计划内容。修改需由所属教练在教练工作台完成。', action: '动作', singleWeek: '单周计划', baselineEntered: '基线 · 教练手填', plannedValue: '计划值', empty: '该计划还没有训练内容。', founderInitial: '创', founder: '创始人' },
} as const

export const enAdmin = {
  page: { overview: 'Overview', users: 'User management', bindings: 'Coach–athlete links', plans: 'Plan overview', exercises: 'Exercise library' },
  role: { admin: 'Admin', coach: 'Coach', coachedStudent: 'Coached athlete', selfTrain: 'Self-coached' },
  binding: { accepted: 'Accepted', pending: 'Pending', rejected: 'Rejected', expired: 'Expired', cancelled: 'Cancelled' },
  planStatus: { published: 'Published', draft: 'Draft', paused: 'Paused', completed: 'Completed' },
  unnamed: 'Name not set', loadFailed: 'Loading failed. Check your connection and try again.', clearFilters: 'Clear filters', viewAll: 'View all', template: 'Template', unscheduled: 'Not scheduled',
  overview: { coaches: 'COACHES // Total coaches', coachesHint: 'All beta coaches', students: 'ATHLETES // Total athletes', studentsHint: (coached, self) => `Coached ${coached} · Self-coached ${self}`, bindings: 'LINKS // Active links', bindingsHint: 'Currently accepted and active', plans: 'PLANS // Published plans', plansHint: 'Currently published plans', recentUsers: 'Recently registered users', noUsers: 'No registered users yet.', recentPlans: 'Recently published plans', noPlans: 'No plans have been published yet.' },
  users: { coachStudents: (count) => countUnit(count, 'athlete', 'athletes'), coachRelation: (name) => `Coach: ${name}`, unbound: 'Not linked', search: 'Search name or phone number', count: (count) => countUnit(count, 'user', 'users'), name: 'Name', role: 'Role', phone: 'Phone number', registeredAt: 'Registered', keyRelation: 'Key relationship', noMatch: 'No matching users.', rowsHint: (count) => `${countUnit(count, 'row', 'rows')} · All beta users · Pagination fallback reserved at 50 per page`, registeredOn: (date) => `Registered ${date}`, basicInfo: 'Basic information', assignedStudents: 'Athletes', bindingRelation: 'Links', assignedCoach: 'Coach', adminNoRelation: 'Admin account; no links.', selfNoCoach: 'Self-coached athlete; no coach link.', noStudents: 'No linked athletes.', noCoach: 'No coach linked yet.', people: (count) => countUnit(count, 'person', 'people'), persons: (count) => countUnit(count, 'person', 'people'), boundOn: (date) => `Linked ${date}`, relatedPlans: 'Related plans', planCount: (count) => countUnit(count, 'plan', 'plans'), noRelatedPlans: 'No related plans.' },
  danger: { title: 'DANGER // Admin actions', hint: 'Dangerous actions require confirmation. More actions will be added later.', deactivateAccount: 'Deactivate account', deactivateHint: 'The user will be unable to sign in; data is retained', deactivate: 'Deactivate', unbindRelation: 'Remove link', unbindHint: 'Remove the existing link and notify both parties', unbind: 'Unlink', confirmTitle: 'DANGER // Confirm action', deactivateTitle: (name) => `Deactivate ${name}’s account`, unbindTitle: (name) => `Remove ${name}’s link`, deactivateBody: 'This user will no longer be able to sign in to MeetPR. Training history and plans are retained and the account can be restored.', unbindBody: 'The link is removed immediately and both parties are notified.', impact: 'Active plans may be paused or lose coach access. Confirm the scope of the impact.', typeToConfirm: 'Type', confirmSuffix: 'to confirm:', confirmUnbind: 'Confirm unlink', deactivated: (name) => `Deactivated ${name}’s account`, unbound: (name) => `Removed ${name}’s link` },
  bindings: { search: 'Search coach or athlete name', count: (count) => countUnit(count, 'link', 'links'), coach: 'Coach', student: 'Athlete', status: 'Status', submittedAt: 'Requested', respondedAt: 'Responded', noMatch: 'No matching links.', empty: 'No links yet.', rowsHint: (count) => `${countUnit(count, 'row', 'rows')} · All beta links · Pagination fallback reserved at 50 per page` },
  plans: { allCoaches: 'All coaches', selfTemplate: 'Template (self-coached)', count: (count) => countUnit(count, 'plan', 'plans'), name: 'Plan name', coach: 'Coach', student: 'Athlete', status: 'Status', cycle: 'Cycle', dates: 'Start and end dates', noMatch: 'No matching plans.', empty: 'No plans yet.', templateDash: '— (Template)', rowsHint: (count) => `${countUnit(count, 'row', 'rows')} · All beta plans · Pagination fallback reserved at 50 per page` },
  exercises: { search: 'Search exercise name or type', count: (count) => countUnit(count, 'exercise', 'exercises'), name: 'Exercise', type: 'Type', planUses: 'Plans using it', coachUses: 'Coaches using it', noMatch: 'No matching exercises.', empty: 'No exercise usage data.', rowsHint: (count) => `${countUnit(count, 'row', 'rows')} · Sorted by plans using the exercise` },
  detail: { baseline: 'Baseline', sameAsLastWeek: 'Same as last week', coachEntered: 'Coach-entered', readOnly: 'Read-only view — admins cannot edit plan content. The assigned coach must make changes in the coach workspace.', action: 'Exercise', singleWeek: 'Single-week plan', baselineEntered: 'Baseline · Coach-entered', plannedValue: 'Planned value', empty: 'This plan has no training content yet.', founderInitial: 'F', founder: 'Founder' },
} satisfies Translations<typeof zhAdmin>
