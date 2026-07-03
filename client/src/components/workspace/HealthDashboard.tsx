import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface HealthData {
  overview: {
    totalChapters: number;
    totalWords: number;
    targetWords: number;
    progress: number;
    avgChapterQuality: number;
  };
  quality: {
    aiSmellRate: number;
    wordCountRate: number;
    styleScore: number;
    infoDensityScore: number;
  };
  lifecycle: {
    hookResolutionRate: number;
    hookTotal: number;
    hookResolved: number;
    hookOverdue: number;
    foreshadowResolutionRate: number;
    foreshadowTotal: number;
    foreshadowResolved: number;
    mainlineCompletionRate: number;
  };
  characters: {
    total: number;
    silent: number;
  };
  emotion: {
    consecutiveClimax: number;
    consecutiveLow: number;
    recentEmotions: Array<{
      chapterOrder: number;
      intensity: number;
      type: string;
      isClimax: boolean;
    }>;
  };
  consistency: {
    hook: number;
    foreshadow: number;
    character: number;
    emotion: number;
    total: number;
  };
  qualityTrend: Array<{
    chapterOrder: number;
    style: number;
    infoDensity: number;
    character: number;
    emotion: number;
    passed: boolean;
    retryCount: number;
  }>;
}

interface HealthDashboardProps {
  novelId: string;
}

export function HealthDashboard({ novelId }: HealthDashboardProps) {
  const { data: health, isLoading, error } = useQuery<HealthData>({
    queryKey: ["novel-health", novelId],
    queryFn: () => api.get(`/api/novels/${novelId}/health`).then((res: any) => res.data.data),
    enabled: !!novelId,
  });

  if (isLoading) {
    return <div className="health-dashboard loading">加载中...</div>;
  }

  if (error || !health) {
    return <div className="health-dashboard error">加载失败</div>;
  }

  return (
    <div className="health-dashboard">
      {/* 全书概览 */}
      <section className="health-section">
        <h3>全书健康概览</h3>
        <div className="health-stats">
          <div className="stat-item">
            <span className="stat-label">总章数</span>
            <span className="stat-value">{health.overview.totalChapters}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">总字数</span>
            <span className="stat-value">{(health.overview.totalWords / 10000).toFixed(1)}万</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">目标</span>
            <span className="stat-value">{(health.overview.targetWords / 10000).toFixed(0)}万</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">进度</span>
            <span className="stat-value">{health.overview.progress}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">平均质量</span>
            <span className="stat-value">{health.overview.avgChapterQuality}/10</span>
          </div>
        </div>
      </section>

      {/* 质量指标 */}
      <section className="health-section">
        <h3>质量指标</h3>
        <div className="health-stats">
          <div className="stat-item">
            <span className="stat-label">AI味得分</span>
            <span className={`stat-value ${health.quality.aiSmellRate <= 0.5 ? 'good' : 'warning'}`}>
              {health.quality.aiSmellRate}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">字数合规</span>
            <span className={`stat-value ${health.quality.wordCountRate >= 95 ? 'good' : 'warning'}`}>
              {health.quality.wordCountRate}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">风格评分</span>
            <span className={`stat-value ${health.quality.styleScore >= 7 ? 'good' : 'warning'}`}>
              {health.quality.styleScore}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">信息密度</span>
            <span className={`stat-value ${health.quality.infoDensityScore >= 7 ? 'good' : 'warning'}`}>
              {health.quality.infoDensityScore}
            </span>
          </div>
        </div>
      </section>

      {/* 生命周期 */}
      <section className="health-section">
        <h3>生命周期</h3>
        <div className="health-stats">
          <div className="stat-item">
            <span className="stat-label">钩子回收率</span>
            <span className={`stat-value ${health.lifecycle.hookResolutionRate >= 95 ? 'good' : 'warning'}`}>
              {health.lifecycle.hookResolutionRate}%
            </span>
            {health.lifecycle.hookOverdue > 0 && (
              <span className="stat-detail">({health.lifecycle.hookOverdue}个逾期)</span>
            )}
          </div>
          <div className="stat-item">
            <span className="stat-label">伏笔回收率</span>
            <span className={`stat-value ${health.lifecycle.foreshadowResolutionRate >= 95 ? 'good' : 'warning'}`}>
              {health.lifecycle.foreshadowResolutionRate}%
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">主线完成度</span>
            <span className="stat-value">{health.lifecycle.mainlineCompletionRate}%</span>
          </div>
        </div>
      </section>

      {/* 角色健康 */}
      <section className="health-section">
        <h3>角色健康</h3>
        <div className="health-stats">
          <div className="stat-item">
            <span className="stat-label">活跃角色</span>
            <span className="stat-value">{health.characters.total}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">沉默角色</span>
            <span className={`stat-value ${health.characters.silent > 0 ? 'warning' : 'good'}`}>
              {health.characters.silent}
            </span>
            {health.characters.silent > 0 && (
              <span className="stat-detail">(&gt;50章未出场)</span>
            )}
          </div>
        </div>
      </section>

      {/* 情绪曲线 */}
      <section className="health-section">
        <h3>情绪节奏</h3>
        <div className="health-stats">
          <div className="stat-item">
            <span className="stat-label">连续高潮</span>
            <span className={`stat-value ${health.emotion.consecutiveClimax >= 3 ? 'warning' : 'good'}`}>
              {health.emotion.consecutiveClimax}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">连续低谷</span>
            <span className={`stat-value ${health.emotion.consecutiveLow >= 5 ? 'warning' : 'good'}`}>
              {health.emotion.consecutiveLow}
            </span>
          </div>
        </div>

        {/* 简易情绪折线图 */}
        {health.emotion.recentEmotions.length > 0 && (
          <div className="emotion-chart">
            <div className="chart-bars">
              {health.emotion.recentEmotions.map((emo) => (
                <div
                  key={emo.chapterOrder}
                  className={`chart-bar ${emo.isClimax ? 'climax' : ''}`}
                  style={{ height: `${emo.intensity * 10}%` }}
                  title={`第${emo.chapterOrder}章: ${emo.type} (${emo.intensity}/10)`}
                />
              ))}
            </div>
            <div className="chart-label">最近{health.emotion.recentEmotions.length}章情绪强度</div>
          </div>
        )}
      </section>

      {/* 一致性问题 */}
      {health.consistency.total > 0 && (
        <section className="health-section">
          <h3>一致性问题</h3>
          <div className="health-stats">
            <div className="stat-item">
              <span className="stat-label">钩子问题</span>
              <span className="stat-value">{health.consistency.hook}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">伏笔问题</span>
              <span className="stat-value">{health.consistency.foreshadow}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">角色问题</span>
              <span className="stat-value">{health.consistency.character}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">情绪问题</span>
              <span className="stat-value">{health.consistency.emotion}</span>
            </div>
          </div>
        </section>
      )}

      {/* 质量趋势 */}
      {health.qualityTrend.length > 0 && (
        <section className="health-section">
          <h3>质量趋势</h3>
          <div className="quality-trend">
            <div className="trend-chart">
              {health.qualityTrend.map((qt) => (
                <div key={qt.chapterOrder} className="trend-item">
                  <div className="trend-bar style" style={{ height: `${qt.style * 10}%` }} title={`风格: ${qt.style}`} />
                  <div className="trend-bar density" style={{ height: `${qt.infoDensity * 10}%` }} title={`密度: ${qt.infoDensity}`} />
                  <div className="trend-bar character" style={{ height: `${qt.character * 10}%` }} title={`角色: ${qt.character}`} />
                  <div className="trend-bar emotion" style={{ height: `${qt.emotion * 10}%` }} title={`情绪: ${qt.emotion}`} />
                </div>
              ))}
            </div>
            <div className="trend-legend">
              <span className="legend-item style">风格</span>
              <span className="legend-item density">密度</span>
              <span className="legend-item character">角色</span>
              <span className="legend-item emotion">情绪</span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
