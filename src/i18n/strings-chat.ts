import type { Translations } from './types'
import { countUnit } from './plural'

export const zhChat = {
  quickReplies: ['按计划完成，很好，下周继续加。', '这组速度掉得太多，下周降 5% 重量。', '视频收到了，我今晚逐组给你反馈。', '这周先别硬顶，睡够再练。', '距比赛还有 5 周，注意控体重。'],
  unnamedStudent: '未命名学员', bindLost: '该学员已不在你的名下', startFailed: '发起对话失败，请重试',
  unbound: '已解除绑定', unboundParenthesized: '（已解除绑定）', assessment: '评估期', activeStudent: '在训学员',
  noUnread: '没有未读消息了', studentList: '学员列表', nextUnread: '下一条未读', messages: '消息',
  cannotOpenPlan: '该学员已不在你的名下，无法打开计划', openPlan: '打开 TA 的计划', expand: '展开聊天', collapse: '收起聊天',
  noMessagesWith: (name: string) => `和 ${name} 还没有消息`, startConversation: '发起对话', chooseConversation: '选择会话开始聊天',
  conversationMissing: '会话不存在', noConversations: '暂无会话', noMessages: '还没有消息',
  unreadCount: (count: number) => `${count} 条未读`, videoReviewCount: (count: number) => `${count} 条视频待审`,
  imagePreview: '[图片]', unsupportedPreview: '[暂不支持的消息]', loadFailed: '消息加载失败，请稍后重试',
  loadEarlier: '加载更早消息', cannotSendBindLost: '该学员已不在你的名下，无法继续发送', me: '我',
  sendFailed: '发送失败', sending: '发送中', quickRepliesAria: '快捷回复', inputMessage: '输入消息', cannotSend: '当前无法发送消息',
  justNow: '刚刚', minutesAgo: (n: number) => `${n} 分钟前`, hoursAgo: (n: number) => `${n} 小时前`,
  daysAgo: (n: number) => `${n} 天前`, monthsAgo: (n: number) => `${n} 个月前`, yearsAgo: (n: number) => `${n} 年前`,
  unknownDate: '日期未知', dayLabel: (month: string, day: string, weekday: string) => `${month}-${day} 周${weekday}`,
  chatImage: '聊天图片', imageUnavailable: '图片暂不可用', unsupportedMessage: '当前版本暂不支持的消息类型',
  setRefLogged: '学员记录的一组', setRefPlanned: '学员今天的计划', trainingShare: '训练分享', trainingPlan: '训练计划',
  setNumber: (n: number) => `第 ${n} 组`, playVideo: '播放视频',
} as const

export const enChat = {
  quickReplies: ['Completed as planned. Great work—add more next week.', 'Speed dropped too much on this set. Reduce the weight by 5% next week.', 'I received the video. I’ll send set-by-set feedback tonight.', 'Do not grind this week. Get enough sleep before training.', 'Five weeks until the meet. Keep an eye on bodyweight.'],
  unnamedStudent: 'Unnamed athlete', bindLost: 'This athlete is no longer linked to you', startFailed: 'Could not start the conversation. Try again.',
  unbound: 'Unlinked', unboundParenthesized: '(Unlinked)', assessment: 'Assessment', activeStudent: 'Active athlete', noUnread: 'No unread messages',
  studentList: 'Athlete list', nextUnread: 'Next unread', messages: 'Messages', cannotOpenPlan: 'This athlete is no longer linked to you, so their plan cannot be opened',
  openPlan: 'Open athlete plan', expand: 'Expand chat', collapse: 'Collapse chat', noMessagesWith: (name) => `No messages with ${name} yet`,
  startConversation: 'Start conversation', chooseConversation: 'Choose a conversation to start chatting', conversationMissing: 'Conversation not found',
  noConversations: 'No conversations', noMessages: 'No messages yet', unreadCount: (count) => `${count} unread`, videoReviewCount: (count) => `${countUnit(count, 'video', 'videos')} to review`,
  imagePreview: '[Image]', unsupportedPreview: '[Unsupported message]', loadFailed: 'Messages failed to load. Try again later.',
  loadEarlier: 'Load earlier messages', cannotSendBindLost: 'This athlete is no longer linked to you. Messages cannot be sent.', me: 'Me',
  sendFailed: 'Send failed', sending: 'Sending', quickRepliesAria: 'Quick replies', inputMessage: 'Type a message', cannotSend: 'Messages cannot be sent right now',
  justNow: 'Just now', minutesAgo: (n) => `${countUnit(n, 'min', 'min')} ago`, hoursAgo: (n) => `${countUnit(n, 'hr', 'hr')} ago`, daysAgo: (n) => `${countUnit(n, 'day', 'days')} ago`,
  monthsAgo: (n) => `${countUnit(n, 'month', 'months')} ago`, yearsAgo: (n) => `${countUnit(n, 'year', 'years')} ago`, unknownDate: 'Unknown date',
  dayLabel: (month, day, weekday) => `${weekday}, ${month} ${day}`, chatImage: 'Chat image', imageUnavailable: 'Image unavailable',
  unsupportedMessage: 'This message type is not supported in the current version', setRefLogged: 'A set logged by the athlete',
  setRefPlanned: "The athlete's plan for today", trainingShare: 'Training share', trainingPlan: 'Training plan', setNumber: (n) => `Set ${n}`, playVideo: 'Play video',
} satisfies Translations<typeof zhChat>
