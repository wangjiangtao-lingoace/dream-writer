/**
 * Dream Writer - 古风化API路由
 * 提供传统线装书风格的数据包装和响应
 */

import { Router, Request, Response } from 'express';
import {
  wrapNovelInfoForAncientUI,
  wrapChapterInfoForAncientUI,
  wrapProgressForAncientUI,
  wrapCharacterForAncientUI,
  wrapAIMessageForAncientUI,
  wrapErrorForAncientUI,
  wrapSuccessForAncientUI,
} from '../services/ancientUiAdapter';

const router = Router();

/**
 * 获取小说信息的古风化包装
 */
router.get('/api/novels/:id/ancient-info', async (req: Request, res: Response) => {
  try {
    // 这里应该调用原有的小说服务，然后进行古风化包装
    // 暂时返回模拟数据，后续连接真实服务
    const mockNovelData = {
      title: '示例小说标题',
      description: '这是一个示例描述，用于测试古风UI适配层',
      author: '古风作者',
      genre: '古风小说',
      targetAudience: '喜爱古典文学的读者',
    };

    const ancientData = wrapNovelInfoForAncientUI(mockNovelData);

    res.json({
      success: true,
      data: ancientData,
      message: '已获取古风化小说信息',
    });
  } catch (error) {
    const ancientError = wrapErrorForAncientUI({
      message: '获取小说信息失败',
      code: 'NOVEL_INFO_ERROR',
    });

    res.status(500).json(ancientError);
  }
});

/**
 * 获取章节信息的古风化包装
 */
router.get('/api/chapters/:chapterId/ancient-info', async (req: Request, res: Response) => {
  try {
    const mockChapterData = {
      chapterTitle: '第一章：墨香初现',
      chapterOrder: 1,
      wordCount: 3200,
      status: 'completed',
    };

    const ancientData = wrapChapterInfoForAncientUI(mockChapterData);

    res.json({
      success: true,
      data: ancientData,
      message: '已获取古风化章节信息',
    });
  } catch (error) {
    const ancientError = wrapErrorForAncientUI({
      message: '获取章节信息失败',
      code: 'CHAPTER_INFO_ERROR',
    });

    res.status(500).json(ancientError);
  }
});

/**
 * 获取进度的古风化包装
 */
router.get('/api/projects/:projectId/progress/ancient', async (req: Request, res: Response) => {
  try {
    const mockProgressData = {
      currentPhase: 'writing',
      progress: 65,
      total: 100,
      message: '正在创作第三章，预计还需2小时完成',
    };

    const ancientData = wrapProgressForAncientUI(mockProgressData);

    res.json({
      success: true,
      data: ancientData,
      message: '已获取古风化进度信息',
    });
  } catch (error) {
    const ancientError = wrapErrorForAncientUI({
      message: '获取进度信息失败',
      code: 'PROGRESS_ERROR',
    });

    res.status(500).json(ancientError);
  }
});

/**
 * 模拟AI助手对话的古风化包装
 */
router.post('/api/creative-hub/ancient-message', async (req: Request, res: Response) => {
  try {
    const { type, content, metadata } = req.body;

    const ancientMessage = wrapAIMessageForAncientUI(
      type as 'system' | 'assistant' | 'tool',
      content,
      metadata
    );

    res.json({
      success: true,
      data: ancientMessage,
      message: '已记录古风化创作对话',
    });
  } catch (error) {
    const ancientError = wrapErrorForAncientUI({
      message: '记录创作对话失败',
      code: 'MESSAGE_ERROR',
    });

    res.status(500).json(ancientError);
  }
});

export default router;
