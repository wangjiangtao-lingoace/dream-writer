import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AncientPaper, AncientCard, AncientButton, AncientInput } from '../../components/AncientPaper';
import '../../styles/ancient-theme.css';
import './AncientWorkspace.css';

/**
 * Dream Writer - 古风创作工作台
 * 传统书房风格的综合创作环境
 */

interface WorkspaceSection {
  id: string;
  title: string;
  icon: string;
}

export default function AncientWorkspace() {
  const { id } = useParams();
  const [activeSection, setActiveSection] = useState('overview');
  const [chapterContent, setChapterContent] = useState('');
  const [wordCount, setWordCount] = useState(0);

  const sections: WorkspaceSection[] = [
    {
      id: 'overview',
      title: '📋 作品概览',
      icon: '📜',
    },
    {
      id: 'chapters',
      title: '📖 章节创作',
      icon: '✍️',
    },
    {
      id: 'characters',
      title: '👥 角色管理',
      icon: '🎭',
    },
    {
      id: 'worldview',
      title: '🌍 世界观设定',
      icon: '🏮',
    },
    {
      id: 'knowledge',
      title: '📚 知识宝库',
      icon: '📖',
    },
    {
      id: 'ai-assistant',
      title: '🤖 智能书童',
      icon: '🎋',
    },
  ];

  const handleSaveChapter = () => {
    // 模拟保存章节
    alert('章节已保存到墨卷中');
  };

  const handleWordCount = () => {
    const count = chapterContent.replace(/\s+/g, '').length;
    setWordCount(count);
  };

  const recentChapters = [
    { title: '第一章：墨香初现', status: '已完成', words: 3200 },
    { title: '第二章：江湖路远', status: '创作中', words: 2800 },
    { title: '第三章：风云际会', status: '草稿', words: 1500 },
  ];

  return (
    <div className="ancient-workspace-container">
      {/* 古风工作台头部 */}
      <div className="workspace-header">
        <div className="workspace-title-section">
          <h1 className="workspace-title">
            {id ? '《作品标题》' : '《未命名作品》'}
          </h1>
          <div className="workspace-meta">
            <span className="meta-item">📖 第3回</span>
            <span className="meta-item">✍️ 创作中</span>
            <span className="meta-item">📊 1.2万字</span>
          </div>
        </div>
        <div className="workspace-decoration">
          <div className="decoration-item">🖋️</div>
          <div className="decoration-item">🌊</div>
          <div className="decoration-item">🎨</div>
        </div>
      </div>

      {/* 侧边栏导航 */}
      <div className="workspace-sidebar">
        <div className="sidebar-title">📚 创作导航</div>
        <div className="sidebar-nav">
          {sections.map((section) => (
            <div
              key={section.id}
              className={`nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <div className="nav-icon">{section.icon}</div>
              <div className="nav-text">{section.title}</div>
              {activeSection === section.id && <div className="nav-indicator">▶</div>}
            </div>
          ))}
        </div>

        {/* 快捷操作 */}
        <div className="quick-actions">
          <div className="action-title">⚡ 快捷操作</div>
          <AncientButton onClick={() => alert('导出全书')} className="action-button">
            📜 导出全书
          </AncientButton>
          <AncientButton onClick={() => alert('查看统计')} className="action-button">
            📊 查看统计
          </AncientButton>
          <AncientButton onClick={() => alert('进入审校模式')} className="action-button">
            🔍 进入审校
          </AncientButton>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="workspace-main">
        {activeSection === 'overview' && (
          <div className="content-section">
            <AncientCard title="作品概览" seal="已开笔">
              <div className="overview-content">
                <div className="overview-item">
                  <div className="item-label">📖 故事梗概</div>
                  <div className="item-content">一个现代青年意外穿越到古代武侠世界...</div>
                </div>
                <div className="overview-item">
                  <div className="item-label">🎭 主角设定</div>
                  <div className="item-content">姓名：林墨香 | 身份：现代青年穿越者</div>
                </div>
                <div className="overview-item">
                  <div className="item-label">🌍 世界背景</div>
                  <div className="item-content">古代武侠世界，正邪对立，门派林立</div>
                </div>
                <div className="overview-item">
                  <div className="item-label">📚 创作进度</div>
                  <div className="item-content">已完成3章，共1.2万字，创作中第4章</div>
                </div>
              </div>
            </AncientCard>
          </div>
        )}

        {activeSection === 'chapters' && (
          <div className="content-section">
            <div className="chapters-header">
              <h2 className="section-title">📖 章节列表</h2>
              <div className="chapters-stats">
                <div className="stat-item">
                  <span className="stat-label">总章节：</span>
                  <span className="stat-value">12章</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">已完成：</span>
                  <span className="stat-value">3章</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">创作中：</span>
                  <span className="stat-value">1章</span>
                </div>
              </div>
            </div>

            <div className="chapters-list">
              {recentChapters.map((chapter, index) => (
                <AncientCard
                  key={index}
                  title={chapter.title}
                  seal={chapter.status === '已完成' ? '完稿' : '草稿'}
                  className="chapter-card"
                >
                  <div className="chapter-info">
                    <div className="chapter-status">{chapter.status}</div>
                    <div className="chapter-words">{chapter.words}字</div>
                  </div>
                  <div className="chapter-actions">
                    <AncientButton size="small" variant="outline">
                      ✏️ 编辑
                    </AncientButton>
                    {chapter.status !== '已完成' && (
                      <AncientButton size="small" variant="outline">
                        🤖 AI续写
                      </AncientButton>
                    )}
                  </div>
                </AncientCard>
              ))}
            </div>

            <AncientButton className="add-chapter-button">
              ➕ 添加新章节
            </AncientButton>
          </div>
        )}

        {activeSection === 'characters' && (
          <div className="content-section">
            <h2 className="section-title">👥 角色管理</h2>
            <AncientCard title="主要角色" seal="已定">
              <div className="characters-grid">
                {['林墨香', '苏清风', '慕容复', '南宫绝'].map((name, index) => (
                  <div key={index} className="character-card">
                    <div className="character-avatar">{name[0]}</div>
                    <div className="character-info">
                      <div className="character-name">{name}</div>
                      <div className="character-role">主角</div>
                    </div>
                  </div>
                ))}
              </div>
            </AncientCard>

            <AncientCard title="角色关系" seal="图谱">
              <div className="relationships-content">
                <p>林墨香 ← 慕容 → 慕容 ← 南宫绝</p>
                <p>林墨香 ↔ 苏清风（师徒）</p>
                <p>慕容复 ← 林墨香（宿敌）</p>
              </div>
            </AncientCard>

            <AncientButton className="add-character-button">
              ➕ 添加角色
            </AncientButton>
          </div>
        )}

        {activeSection === 'ai-assistant' && (
          <div className="content-section">
            <h2 className="section-title">🤖 智能书童</h2>
            <div className="ai-assistant-container">
              <div className="assistant-avatar">
                <div className="avatar-image">🎋</div>
                <div className="avatar-name">古风书童</div>
              </div>

              <div className="conversation-area">
                <div className="conversation-messages">
                  <div className="message assistant-message">
                    <div className="message-sender">书童</div>
                    <div className="message-content">
                      林兄好！我看您前面的章节写得很有古风韵味。不过第三章的动作场面是否可以再丰富一些？现在的对话略显单薄，建议增加一些环境描写和细节刻画。
                    </div>
                  </div>
                </div>
              </div>

              <div className="input-area">
                <AncientInput
                  value={chapterContent}
                  onChange={setChapterContent}
                  placeholder="请书童帮您续写或修改章节..."
                  multiline
                  rows={6}
                />
                <div className="input-actions">
                  <div className="word-count">字数：{wordCount}</div>
                  <AncientButton onClick={handleWordCount} variant="outline" size="small">
                    📊 统计
                  </AncientButton>
                  <AncientButton onClick={handleSaveChapter} size="small">
                    💾 保存
                  </AncientButton>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
