import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AncientPaper, AncientCard, AncientButton, AncientInput } from '../../components/AncientPaper';
import '../../styles/ancient-theme.css';
import './AncientHomePage.css';

/**
 * Dream Writer - 古风首页
 * 传统线装书风格的快速启动页面
 */

export default function AncientHomePage() {
  const navigate = useNavigate();
  const [ideaInput, setIdeaInput] = useState('');
  const [selectedScenario, setSelectedScenario] = useState<'idea' | 'imitate' | 'continue' | 'analyze'>('idea');
  const [isProcessing, setIsProcessing] = useState(false);

  const scenarios = [
    {
      id: 'idea' as const,
      title: '💭 灵感初现',
      description: '我有一个模糊的想法，希望AI帮我整理和完善',
      icon: '✨',
    },
    {
      id: 'imitate' as const,
      title: '📚 仿写经典',
      description: '我想模仿某本名著的写作风格和结构',
      icon: '📖',
    },
    {
      id: 'continue' as const,
      title: '✍️ 续写佳作',
      description: '我已经写了一部分，希望AI继续帮我完成',
      icon: '🌟',
    },
    {
      id: 'analyze' as const,
      title: '📖 拆解秘籍',
      description: '我想分析某本书的结构和写作技巧',
      icon: '🔍',
    },
  ];

  const handleStartCreation = async () => {
    if (!ideaInput.trim()) {
      alert('请先输入你的创作想法');
      return;
    }

    setIsProcessing(true);

    try {
      // 调用AI引导服务，这里暂时模拟，后续连接真实后端
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 根据选择的场景跳转到相应页面
      switch (selectedScenario) {
        case 'idea':
          navigate('/workspace');
          break;
        case 'imitate':
          navigate('/workspace');
          break;
        case 'continue':
          navigate('/workspace');
          break;
        case 'analyze':
          navigate('/workspace');
          break;
      }
    } catch (error) {
      console.error('启动创作失败:', error);
      alert('启动创作失败，请稍后重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickTemplate = (template: string) => {
    setIdeaInput(template);
  };

  const quickTemplates = [
    {
      title: '武侠江湖',
      idea: '一个现代青年意外穿越到古代武侠世界，从无名小卒成长为一代宗师',
    },
    {
      title: '古言宫斗',
      idea: '一个聪慧少女在深宫中步步为营，最终成为当朝皇后',
    },
    {
      title: '仙侠修真',
      idea: '一个平凡少年意外获得修真机缘，从此踏上逆天改命的仙途',
    },
  ];

  return (
    <div className="ancient-home-container">
      {/* 古风标题区域 */}
      <div className="ancient-header">
        <h1 className="ancient-main-title">
          梦中笔者
        </h1>
        <p className="ancient-subtitle">
          墨香流传，笔耕不辍
        </p>
        <div className="ancient-decoration-line"></div>
      </div>

      {/* 主要创作区域 */}
      <div className="ancient-main-content">
        <AncientCard title="请告知你的创作想法" seal="启笔">
          <div className="idea-input-section">
            <label className="ancient-label">创作想法</label>
            <AncientInput
              value={ideaInput}
              onChange={setIdeaInput}
              placeholder="例如：一个关于穿越时空的小说..."
              multiline
              rows={4}
              className="idea-textarea"
            />
          </div>

          {/* 快速模板选择 */}
          <div className="quick-templates-section">
            <p className="ancient-description">或选择快速模板：</p>
            <div className="template-grid">
              {quickTemplates.map((template, index) => (
                <div
                  key={index}
                  className="template-card"
                  onClick={() => handleQuickTemplate(template.idea)}
                >
                  <div className="template-title">{template.title}</div>
                  <div className="template-preview">{template.idea.substring(0, 30)}...</div>
                </div>
              ))}
            </div>
          </div>
        </AncientCard>

        {/* 场景选择 */}
        <div className="scenario-selection">
          <h2 className="section-title">选择创作场景</h2>
          <div className="scenario-grid">
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                className={`scenario-card ${selectedScenario === scenario.id ? 'selected' : ''}`}
                onClick={() => setSelectedScenario(scenario.id)}
              >
                <div className="scenario-icon">{scenario.icon}</div>
                <div className="scenario-title">{scenario.title}</div>
                <div className="scenario-description">{scenario.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 开始创作按钮 */}
        <AncientButton
          onClick={handleStartCreation}
          disabled={!ideaInput.trim() || isProcessing}
          loading={isProcessing}
          className="start-creation-button"
        >
          {isProcessing ? '正在准备...' : '开始创作'}
        </AncientButton>

        {/* 创作指南 */}
        <div className="creation-guide">
          <h3 className="guide-title">📜 创作指南</h3>
          <div className="guide-content">
            <div className="guide-step">
              <span className="step-number">一</span>
              <span className="step-text">输入想法或选择模板</span>
            </div>
            <div className="guide-step">
              <span className="step-number">二</span>
              <span className="step-text">选择合适的创作场景</span>
            </div>
            <div className="guide-step">
              <span className="step-number">三</span>
              <span className="step-text">AI古风书童全程陪伴创作</span>
            </div>
            <div className="guide-step">
              <span className="step-number">四</span>
              <span className="step-text">在古色古香的线装书环境中完成作品</span>
            </div>
          </div>
        </div>
      </div>

      {/* 侧边栏 */}
      <div className="ancient-sidebar">
        <div className="sidebar-section">
          <h3 className="sidebar-title">📚 最近作品</h3>
          <div className="recent-works">
            <div className="work-item">
              <div className="work-title">《墨香初现》</div>
              <div className="work-meta">创作中 • 65%</div>
            </div>
            <div className="work-item">
              <div className="work-title">《江湖夜雨》</div>
              <div className="work-meta">已完成 • 12万字</div>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-title">🎨 古风特色</h3>
          <div className="feature-list">
            <div className="feature-item">
              <span className="feature-icon">🖋️</span>
              <span className="feature-text">传统线装书风格</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🤖</span>
              <span className="feature-text">AI智能创作伙伴</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">📚</span>
              <span className="feature-text">多场景创作支持</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🌊</span>
              <span className="feature-text">沉浸式古风体验</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
