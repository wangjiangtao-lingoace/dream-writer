import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

const GeneralKnowledge: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    category: "phrase",
    content: "",
    tags: "",
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  useEffect(() => {
    loadItems();
  }, [filterCategory]);

  const loadItems = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCategory) params.append("category", filterCategory);
      if (searchTerm) params.append("search", searchTerm);

      const data = await api.get<{ items: KnowledgeItem[]; total: number }>(
        `/api/general-knowledge?${params.toString()}`
      );
      setItems(data?.items || []);
    } catch (error) {
      console.error("加载知识库失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadItems();
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.content.trim()) {
      alert("标题和内容为必填项");
      return;
    }

    try {
      if (editingItem) {
        await api.put(`/api/general-knowledge/${editingItem.id}`, formData);
      } else {
        await api.post("/api/general-knowledge", formData);
      }
      setFormData({ title: "", category: "phrase", content: "", tags: "" });
      setShowForm(false);
      setEditingItem(null);
      loadItems();
    } catch (error) {
      console.error("保存失败:", error);
    }
  };

  const handleEdit = (item: KnowledgeItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      category: item.category,
      content: item.content,
      tags: item.tags || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条知识吗？")) return;
    try {
      await api.delete(`/api/general-knowledge/${id}`);
      loadItems();
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const getCategoryLabel = (category: string) => {
    const categoryMap: Record<string, string> = {
      phrase: "优美词句",
      setting: "设定模板",
      template: "写作模板",
      character: "人物设定",
      worldview: "世界观",
    };
    return categoryMap[category] || category;
  };

  const categories = [
    { value: "", label: "全部" },
    { value: "phrase", label: "优美词句" },
    { value: "setting", label: "设定模板" },
    { value: "template", label: "写作模板" },
    { value: "character", label: "人物设定" },
    { value: "worldview", label: "世界观" },
  ];

  return (
    <div className="general-knowledge">
      <header className="knowledge-header">
        <button className="btn-back" onClick={() => navigate("/")}>
          ← 返回书架
        </button>
        <h1>通用知识库</h1>
        <button className="btn-add" onClick={() => setShowForm(true)}>
          + 添加知识
        </button>
      </header>

      <div className="knowledge-toolbar">
        <div className="search-bar">
          <input
            type="text"
            placeholder="搜索知识..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          />
          <button onClick={handleSearch}>搜索</button>
        </div>
        <div className="category-filter">
          {categories.map((cat) => (
            <button
              key={cat.value}
              className={filterCategory === cat.value ? "active" : ""}
              onClick={() => setFilterCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <div className="knowledge-form-overlay">
          <div className="knowledge-form">
            <h2>{editingItem ? "编辑知识" : "添加知识"}</h2>
            <div className="form-group">
              <label>标题 *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="请输入标题"
              />
            </div>
            <div className="form-group">
              <label>分类</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                <option value="phrase">优美词句</option>
                <option value="setting">设定模板</option>
                <option value="template">写作模板</option>
                <option value="character">人物设定</option>
                <option value="worldview">世界观</option>
              </select>
            </div>
            <div className="form-group">
              <label>内容 *</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="请输入内容"
                rows={10}
              />
            </div>
            <div className="form-group">
              <label>标签</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="多个标签用逗号分隔"
              />
            </div>
            <div className="form-actions">
              <button onClick={handleSubmit}>
                {editingItem ? "保存" : "创建"}
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingItem(null);
                  setFormData({ title: "", category: "phrase", content: "", tags: "" });
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="knowledge-content">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <p>暂无知识，点击上方按钮添加</p>
          </div>
        ) : (
          <div className="knowledge-grid">
            {items.map((item) => (
              <div key={item.id} className="knowledge-card">
                <div className="card-header">
                  <span className="category">{getCategoryLabel(item.category)}</span>
                  <div className="card-actions">
                    <button onClick={() => handleEdit(item)}>编辑</button>
                    <button onClick={() => handleDelete(item.id)}>删除</button>
                  </div>
                </div>
                <h3>{item.title}</h3>
                <div className="card-content">
                  {item.content.length > 200
                    ? item.content.substring(0, 200) + "..."
                    : item.content}
                </div>
                {item.tags && (
                  <div className="card-tags">
                    {item.tags.split(",").map((tag, index) => (
                      <span key={index} className="tag">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <div className="card-footer">
                  <span className="update-time">
                    更新于 {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default GeneralKnowledge;
