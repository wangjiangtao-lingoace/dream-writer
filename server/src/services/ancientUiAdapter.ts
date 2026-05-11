/**
 * Dream Writer - 古风UI适配服务
 * 为业务逻辑提供传统线装书风格的UI包装
 */

import { AncientCard } from '../../../client/src/components/AncientPaper';

/**
 * 古风化的小说信息包装器
 */
export function wrapNovelInfoForAncientUI(data: {
  title: string;
  description: string;
  author?: string;
  genre?: string;
  targetAudience?: string;
}) {
  return {
    title: `《${data.title}》`,
    description: data.description || '暂无简介',
    author: data.author ? `作者：${data.author}` : undefined,
    genre: data.genre ? `题材：${data.genre}` : undefined,
    targetAudience: data.targetAudience ? `目标读者：${data.targetAudience}` : undefined,
  };
}

/**
 * 古风化的章节信息包装器
 */
export function wrapChapterInfoForAncientUI(data: {
  chapterTitle: string;
  chapterOrder: number;
  wordCount?: number;
  status: string;
}) {
  return {
    chapterTitle: data.chapterTitle,
    chapterOrder: `第${data.chapterOrder}回`,
    wordCount: data.wordCount ? `约${data.wordCount}字` : undefined,
    status: getAncientStatusText(data.status),
  };
}

/**
 * 古风化的状态文本转换
 */
function getAncientStatusText(status: string): string {
  const statusMap: {
    [key: string]: string;
  } = {
    'draft': '草稿初成',
    'in_progress': '创作中',
    'completed': '已成章',
    'review': '审校中',
    'repair': '润色中',
  };
  return statusMap[status] || status;
}

/**
 * 古风化的进度信息包装器
 */
export function wrapProgressForAncientUI(data: {
  currentPhase: string;
  progress: number;
  total: number;
  message?: string;
}) {
  const phaseMap: {
    [key: string]: string;
  } = {
    'planning': '构思阶段',
    'writing': '创作阶段',
    'review': '审校阶段',
    'publish': '完稿阶段',
  };

  const progressPercent = Math.round((data.progress / data.total) * 100);

  return {
    currentPhase: phaseMap[data.currentPhase] || data.currentPhase,
    progress: `${progressPercent}%`,
    message: data.message || '按部就班进行中',
  };
}

/**
 * 古风化的角色信息包装器
 */
export function wrapCharacterForAncientUI(data: {
  name: string;
  role?: string;
  personality?: string;
  background?: string;
}) {
  return {
    name: data.name,
    role: data.role ? `身份：${data.role}` : undefined,
    personality: data.personality ? `性格：${data.personality}` : undefined,
    background: data.background ? `背景：${data.background}` : undefined,
  };
}

/**
 * 古风化的AI消息包装器
 */
export function wrapAIMessageForAncientUI(
  type: 'system' | 'assistant' | 'tool',
  content: string,
  metadata?: Record<string, any>
) {
  const typeMap = {
    'system': '【系统消息】',
    'assistant': '【书童回复】',
    'tool': '【工具调用】',
  };

  return {
    type: type,
    prefix: typeMap[type] || '',
    content: content,
    timestamp: new Date().toLocaleString('zh-CN'),
    metadata,
  };
}

/**
 * 古风化的错误信息包装器
 */
export function wrapErrorForAncientUI(error: {
  message: string;
  code?: string;
  details?: any;
}) {
  return {
    message: `【创作障碍】${error.message}`,
    code: error.code ? `错误码：${error.code}` : undefined,
    details: error.details,
    timestamp: new Date().toLocaleString('zh-CN'),
  };
}

/**
 * 古风化的成功信息包装器
 */
export function wrapSuccessForAncientUI(action: string, details?: string) {
  return {
    message: `【创作顺利】${action}`,
    details,
    timestamp: new Date().toLocaleString('zh-CN'),
    type: 'success' as const,
  };
}
