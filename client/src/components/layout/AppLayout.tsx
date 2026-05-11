import React from 'react';
import { Outlet } from 'react-router-dom';
import { AncientButton } from '../AncientPaper';
import '../../styles/ancient-theme.css';

/**
 * Dream Writer - 古风应用布局（增强版）
 * 传统线装书风格的整体布局
 */

export default function AppLayout() {
  return (
    <div className="ancient-layout">
      {/* 古风头部 */}
      <header className="ancient-layout-header">
        <div className="layout-decoration">
          <span className="decoration-cloud">☁</span>
        </div>
        <div className="layout-title-section">
          <h1 className="layout-title brush-stroke-effect" data-text="梦中有笔者">
            梦中有笔者
          </h1>
          <div className="layout-subtitle">
            墨香流传，笔耕不辍
          </div>
        </div>
        <nav className="layout-nav">
          <AncientButton
            onClick={() => window.location.href = '/'}
            variant="outline"
            className="layout-nav-button"
          >
            🏠 首页
          </AncientButton>
          <AncientButton
            onClick={() => window.location.href = '/workspace'}
            variant="outline"
            className="layout-nav-button"
          >
            🖋️ 工作台
          </AncientButton>
        </nav>
      </header>

      {/* 古风主体 */}
      <main className="ancient-layout-main">
        <div className="layout-decoration-pattern"></div>
        <Outlet />
      </main>

      {/* 古风页脚 */}
      <footer className="ancient-layout-footer">
        <div className="footer-seal">
          <span className="seal-text">梦</span>
        </div>
        <div className="footer-content">
          <p className="footer-text">
            古色古香AI小说创作平台
          </p>
          <p className="footer-copyright">
            © 2026 梦中有笔者 · 墨香纯正
          </p>
        </div>
      </footer>
    </div>
  );
}
