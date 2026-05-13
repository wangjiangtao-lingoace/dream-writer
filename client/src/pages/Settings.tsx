import React, { useState } from "react";
import { useAIConfigs, useDefaultConfig, useCreateConfig, useDeleteConfig, useTestConfig } from "../hooks/useConfig";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import "../styles/pages/settings.css";

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] },
  { value: "qwen", label: "Qwen", models: ["qwen-plus", "qwen-turbo"] },
  { value: "glm", label: "GLM", models: ["glm-4", "glm-4-flash"] },
  { value: "kimi", label: "Kimi", models: ["moonshot-v1-8k", "moonshot-v1-32k"] },
  { value: "gemini", label: "Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
  { value: "mimo", label: "Mimo", models: ["mimo-v2.5-pro", "mimo-v2.5-flash"] },
];

const Settings: React.FC = () => {
  const { data: configs, isLoading } = useAIConfigs();
  const { data: defaultConfig } = useDefaultConfig();
  const createConfig = useCreateConfig();
  const deleteConfig = useDeleteConfig();
  const testConfig = useTestConfig();

  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("deepseek-chat");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    try {
      await createConfig.mutateAsync({
        provider,
        model,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        isDefault: !configs || configs.length === 0,
      });
      setShowForm(false);
      setApiKey("");
      setBaseUrl("");
    } catch (error) {
      console.error("创建配置失败:", error);
    }
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    try {
      const result = await testConfig.mutateAsync(id);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: "测试失败" });
    }
  };

  return (
    <div className="settings">
      <h1 className="settings-header">AI 模型配置</h1>

      {/* 已有配置列表 */}
      <div className="settings-section">
        <div className="settings-section-title">已配置的模型</div>
        {isLoading ? (
          <div style={{ color: "var(--text-muted)", padding: "var(--space-4)" }}>加载中...</div>
        ) : configs && configs.length > 0 ? (
          configs.map((config) => (
            <div key={config.id} className={`config-card ${config.isDefault ? "active" : ""}`}>
              <div className="config-card-header">
                <span className="config-card-provider">{config.provider.toUpperCase()}</span>
                {config.isDefault && (
                  <span className="config-card-badge" style={{ background: "rgba(34,197,94,0.15)", color: "var(--success)" }}>
                    默认
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <Button size="sm" variant="ghost" onClick={() => handleTest(config.id)}>
                  测试连接
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteConfig.mutate(config.id)}>
                  删除
                </Button>
              </div>
              <div className="config-card-details">
                <div className="config-card-field">
                  <div className="config-card-field-label">模型</div>
                  <div className="config-card-field-value">{config.model}</div>
                </div>
                <div className="config-card-field">
                  <div className="config-card-field-label">API Key</div>
                  <div className="config-card-field-value" style={{ color: "var(--text-disabled)" }}>sk-••••••</div>
                </div>
                {config.baseUrl && (
                  <div className="config-card-field">
                    <div className="config-card-field-label">Base URL</div>
                    <div className="config-card-field-value">{config.baseUrl}</div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--text-muted)", padding: "var(--space-4)", textAlign: "center" }}>
            还没有配置任何 AI 模型
          </div>
        )}

        {/* 测试结果 */}
        {testResult && (
          <div style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: testResult.success ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
            color: testResult.success ? "var(--success)" : "var(--error)",
            fontSize: "var(--text-sm)",
            marginTop: "var(--space-2)",
          }}>
            {testResult.message}
          </div>
        )}

        {/* 添加按钮 */}
        <div className="config-add" onClick={() => setShowForm(true)}>
          + 添加更多提供商
        </div>
      </div>

      {/* 添加配置弹窗 */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加 AI 模型配置">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)", display: "block" }}>
              AI 提供商
            </label>
            <select
              className="input"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                const p = PROVIDERS.find((p) => p.value === e.target.value);
                if (p) setModel(p.models[0]);
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)", display: "block" }}>
              模型
            </label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {selectedProvider?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <Input
            label="API Key"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          <Input
            label="Base URL（可选）"
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />

          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button variant="primary" onClick={handleSubmit} loading={createConfig.isPending} disabled={!apiKey.trim()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
