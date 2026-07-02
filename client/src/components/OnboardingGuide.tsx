import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "./ui/Button";
import "../styles/components/onboarding.css";

const STORAGE_KEY = "dream-writer-onboarding-completed";

interface Step {
  title: string;
  description: string;
  content: React.ReactNode;
}

interface OnboardingGuideProps {
  onComplete: () => void;
}

const OnboardingGuide: React.FC<OnboardingGuideProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const handleCreateNovel = () => {
    onComplete();
    navigate("/create/new");
  };

  const handleAnalyzeBook = () => {
    onComplete();
    navigate("/create/analyze");
  };

  const handleImportContinue = () => {
    onComplete();
    navigate("/create/import");
  };

  const steps: Step[] = [
    {
      title: "欢迎来到 Dream Writer",
      description: "AI 驱动的智能小说创作平台",
      content: (
        <div className="onboarding-welcome">
          <div className="onboarding-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div className="onboarding-features">
            <div className="onboarding-feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div>
                <div className="onboarding-feature-title">AI 智能创作</div>
                <div className="onboarding-feature-desc">多种 AI 模型辅助，自动生成章节内容</div>
              </div>
            </div>
            <div className="onboarding-feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <div>
                <div className="onboarding-feature-title">知识库管理</div>
                <div className="onboarding-feature-desc">世界观、人物、大纲一站式管理</div>
              </div>
            </div>
            <div className="onboarding-feature">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <div>
                <div className="onboarding-feature-title">一致性检查</div>
                <div className="onboarding-feature-desc">自动检测剧情矛盾，保持故事连贯</div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "选择创作方式",
      description: "选择最适合你的创作起点",
      content: (
        <div className="onboarding-choices">
          <button className="onboarding-choice" onClick={handleCreateNovel}>
            <div className="onboarding-choice-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="onboarding-choice-content">
              <div className="onboarding-choice-title">独立创作</div>
              <div className="onboarding-choice-desc">从零开始，构建你的原创故事</div>
            </div>
            <svg className="onboarding-choice-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <button className="onboarding-choice" onClick={handleAnalyzeBook}>
            <div className="onboarding-choice-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div className="onboarding-choice-content">
              <div className="onboarding-choice-title">拆书创作</div>
              <div className="onboarding-choice-desc">分析现有作品，学习写作技巧后创作</div>
            </div>
            <svg className="onboarding-choice-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <button className="onboarding-choice" onClick={handleImportContinue}>
            <div className="onboarding-choice-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div className="onboarding-choice-content">
              <div className="onboarding-choice-title">导入续写</div>
              <div className="onboarding-choice-desc">导入已有内容，继续创作后续章节</div>
            </div>
            <svg className="onboarding-choice-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      ),
    },
    {
      title: "快速开始",
      description: "配置 AI 后即可开始创作",
      content: (
        <div className="onboarding-quickstart">
          <div className="onboarding-step-list">
            <div className="onboarding-step-item">
              <div className="onboarding-step-number">1</div>
              <div className="onboarding-step-content">
                <div className="onboarding-step-title">配置 AI 模型</div>
                <div className="onboarding-step-desc">在书架页面顶部配置 API Key</div>
              </div>
            </div>
            <div className="onboarding-step-item">
              <div className="onboarding-step-number">2</div>
              <div className="onboarding-step-content">
                <div className="onboarding-step-title">创建新作品</div>
                <div className="onboarding-step-desc">选择题材、设定主角和世界观</div>
              </div>
            </div>
            <div className="onboarding-step-item">
              <div className="onboarding-step-number">3</div>
              <div className="onboarding-step-content">
                <div className="onboarding-step-title">开始创作</div>
                <div className="onboarding-step-desc">使用 AI 辅助生成章节内容</div>
              </div>
            </div>
          </div>
          <div className="onboarding-tip">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4m0-4h.01" />
            </svg>
            <span>提示：点击右上角「新建作品」按钮即可开始</span>
          </div>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const step = steps[currentStep];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <button className="onboarding-skip" onClick={onComplete}>
          跳过引导
        </button>

        <div className="onboarding-header">
          <h2 className="onboarding-title">{step.title}</h2>
          <p className="onboarding-desc">{step.description}</p>
        </div>

        <div className="onboarding-body">{step.content}</div>

        <div className="onboarding-footer">
          <div className="onboarding-dots">
            {steps.map((_, i) => (
              <button
                key={i}
                className={`onboarding-dot ${i === currentStep ? "onboarding-dot-active" : ""}`}
                onClick={() => setCurrentStep(i)}
              />
            ))}
          </div>
          <div className="onboarding-actions">
            {currentStep > 0 && (
              <Button variant="secondary" onClick={handlePrev}>
                上一步
              </Button>
            )}
            <Button variant="primary" onClick={handleNext}>
              {currentStep === steps.length - 1 ? "开始使用" : "下一步"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const shouldShowOnboarding = (): boolean => {
  return !localStorage.getItem(STORAGE_KEY);
};

export const completeOnboarding = (): void => {
  localStorage.setItem(STORAGE_KEY, "true");
};

export default OnboardingGuide;
