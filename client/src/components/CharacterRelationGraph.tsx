import React, { useMemo, useCallback, useState } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  Panel,
} from "reactflow";
import "reactflow/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Character {
  id: string;
  name: string;
  role?: string;
  identity?: string;
  tags?: string;
}

interface CharacterRelation {
  id: string;
  charA: string;
  charB: string;
  relType: string;
  description?: string;
  startChapter?: number;
  endChapter?: number;
  status: string;
}

interface CharacterRelationGraphProps {
  novelId: string;
}

// 关系类型样式配置
const getEdgeStyleByRelType = (relType: string) => {
  const styles: Record<string, any> = {
    师徒: { stroke: "#3b82f6", strokeWidth: 2, label: "师徒" },
    敌对: { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5", label: "敌对" },
    敌人: { stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "5,5", label: "敌人" },
    盟友: { stroke: "#22c55e", strokeWidth: 2, label: "盟友" },
    暧昧: { stroke: "#ec4899", strokeWidth: 2, label: "暧昧" },
    恋人: { stroke: "#f472b6", strokeWidth: 3, label: "恋人" },
    亲属: { stroke: "#8b5cf6", strokeWidth: 2, label: "亲属" },
    竞争: { stroke: "#f59e0b", strokeWidth: 2, strokeDasharray: "3,3", label: "竞争" },
  };
  return styles[relType] || { stroke: "#64748b", strokeWidth: 1, label: relType };
};

// 角色节点样式
const getNodeStyle = (role?: string) => {
  const baseStyle = {
    padding: "12px 20px",
    borderRadius: "50%",
    fontSize: "14px",
    fontWeight: 500,
    width: "100px",
    height: "100px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center" as const,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  };

  if (role?.includes("主角") || role?.includes("男主") || role?.includes("女主")) {
    return { ...baseStyle, background: "#fef3c7", border: "3px solid #f59e0b" };
  }
  if (role?.includes("反派") || role?.includes("反角")) {
    return { ...baseStyle, background: "#fee2e2", border: "3px solid #ef4444" };
  }
  if (role?.includes("配角")) {
    return { ...baseStyle, background: "#dbeafe", border: "2px solid #3b82f6" };
  }
  return { ...baseStyle, background: "#f1f5f9", border: "2px solid #94a3b8" };
};

// 圆形布局算法
const calculateCircleLayout = (index: number, total: number) => {
  const radius = Math.max(200, total * 30);
  const angle = (2 * Math.PI / total) * index - Math.PI / 2;
  return {
    x: 400 + radius * Math.cos(angle),
    y: 300 + radius * Math.sin(angle),
  };
};

const CharacterRelationGraph: React.FC<CharacterRelationGraphProps> = ({ novelId }) => {
  const [selectedNode, setSelectedNode] = useState<Character | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CharacterRelation | null>(null);

  // 获取角色列表
  const { data: charactersRes } = useQuery({
    queryKey: ["characters", novelId],
    queryFn: () => api.get<{ success: boolean; data: Character[] }>(`/api/characters/${novelId}`),
    enabled: !!novelId,
  });

  // 获取关系列表
  const { data: relationsRes } = useQuery({
    queryKey: ["character-relations", novelId],
    queryFn: () => api.get<{ success: boolean; data: CharacterRelation[] }>(`/api/characters/relations/${novelId}`),
    enabled: !!novelId,
  });

  const characters = charactersRes?.data || [];
  const relations = relationsRes?.data || [];

  // 构建角色名到 ID 的映射
  const nameToIdMap = useMemo(() => {
    const map = new Map<string, string>();
    characters.forEach((char) => {
      map.set(char.name, char.id);
    });
    return map;
  }, [characters]);

  // 构建节点
  const initialNodes: Node[] = useMemo(() => {
    return characters.map((char, index) => {
      const tags = char.tags ? JSON.parse(char.tags) : [];
      return {
        id: char.id,
        type: "default",
        position: calculateCircleLayout(index, characters.length),
        data: {
          label: (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{char.name}</div>
              {char.role && <div style={{ fontSize: "11px", opacity: 0.7 }}>{char.role}</div>}
              {tags.length > 0 && (
                <div style={{ fontSize: "10px", marginTop: "4px" }}>
                  {tags.slice(0, 2).map((tag: string, i: number) => (
                    <span
                      key={i}
                      style={{
                        background: "rgba(0,0,0,0.1)",
                        padding: "2px 6px",
                        borderRadius: "8px",
                        marginRight: "4px",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        },
        style: getNodeStyle(char.role),
      };
    });
  }, [characters]);

  // 构建边
  const initialEdges: Edge[] = useMemo(() => {
    const edges = relations
      .filter((rel) => rel.status === "active")
      .map((rel) => {
        const sourceId = nameToIdMap.get(rel.charA);
        const targetId = nameToIdMap.get(rel.charB);

        if (!sourceId || !targetId) {
          console.warn(`关系 ${rel.charA} -> ${rel.charB} 对应的角色未找到`);
          return null;
        }

        const style = getEdgeStyleByRelType(rel.relType);
        return {
          id: rel.id,
          source: sourceId,
          target: targetId,
          label: style.label,
          animated: rel.relType === "暧昧" || rel.relType === "恋人",
          style: {
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            strokeDasharray: style.strokeDasharray,
          },
          labelStyle: {
            fontSize: "12px",
            fontWeight: 500,
            fill: style.stroke,
          },
          labelBgStyle: {
            fill: "#fff",
            fillOpacity: 0.8,
          },
          data: rel,
        } as Edge;
      })
      .filter((edge): edge is Edge => edge !== null);

    return edges;
  }, [relations, nameToIdMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 当数据变化时更新节点和边
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // 节点点击事件
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const char = characters.find((c) => c.id === node.id);
      setSelectedNode(char || null);
      setSelectedEdge(null);
    },
    [characters]
  );

  // 边点击事件
  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const rel = relations.find((r) => r.id === edge.id);
      setSelectedEdge(rel || null);
      setSelectedNode(null);
    },
    [relations]
  );

  if (characters.length === 0) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: "18px", marginBottom: "8px" }}>暂无人物数据</div>
        <div style={{ fontSize: "14px" }}>请先在"人物卡"页面添加人物</div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const char = characters.find((c) => c.id === node.id);
            return getNodeStyle(char?.role).border;
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        <Panel position="top-left" style={{ background: "#fff", padding: "16px", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "12px" }}>关系图例</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
            {[
              { type: "盟友", color: "#22c55e" },
              { type: "师徒", color: "#3b82f6" },
              { type: "敌对", color: "#ef4444" },
              { type: "恋人", color: "#f472b6" },
              { type: "亲属", color: "#8b5cf6" },
              { type: "竞争", color: "#f59e0b" },
            ].map((item) => (
              <div key={item.type} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "24px", height: "2px", background: item.color }}></div>
                <span>{item.type}</span>
              </div>
            ))}
          </div>
        </Panel>
      </ReactFlow>

      {/* 右侧详情面板 */}
      {(selectedNode || selectedEdge) && (
        <div
          style={{
            position: "absolute",
            top: "20px",
            right: "20px",
            width: "300px",
            maxHeight: "80%",
            background: "#fff",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            padding: "20px",
            overflow: "auto",
          }}
        >
          <button
            onClick={() => {
              setSelectedNode(null);
              setSelectedEdge(null);
            }}
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "none",
              border: "none",
              fontSize: "20px",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            ×
          </button>

          {selectedNode && (
            <div>
              <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "16px" }}>
                {selectedNode.name}
              </div>
              {selectedNode.role && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>角色定位</div>
                  <div style={{ fontSize: "14px" }}>{selectedNode.role}</div>
                </div>
              )}
              {selectedNode.identity && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>身份</div>
                  <div style={{ fontSize: "14px" }}>{selectedNode.identity}</div>
                </div>
              )}
              {selectedNode.tags && JSON.parse(selectedNode.tags).length > 0 && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>标签</div>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    {JSON.parse(selectedNode.tags).map((tag: string, i: number) => (
                      <span
                        key={i}
                        style={{
                          background: "#e2e8f0",
                          padding: "4px 10px",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "16px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>相关关系</div>
                {relations
                  .filter((rel) => rel.charA === selectedNode.name || rel.charB === selectedNode.name)
                  .map((rel) => {
                    const otherName = rel.charA === selectedNode.name ? rel.charB : rel.charA;
                    const style = getEdgeStyleByRelType(rel.relType);
                    return (
                      <div
                        key={rel.id}
                        style={{
                          padding: "8px",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          marginBottom: "6px",
                          fontSize: "13px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontWeight: 500 }}>{otherName}</span>
                          <span style={{ color: style.stroke }}>· {rel.relType}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {selectedEdge && (
            <div>
              <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "16px" }}>关系详情</div>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "14px", marginBottom: "8px" }}>
                  <span style={{ fontWeight: 500 }}>{selectedEdge.charA}</span>
                  <span style={{ margin: "0 8px", color: "#64748b" }}>→</span>
                  <span style={{ fontWeight: 500 }}>{selectedEdge.charB}</span>
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>关系类型</div>
                <div
                  style={{
                    fontSize: "14px",
                    color: getEdgeStyleByRelType(selectedEdge.relType).stroke,
                    fontWeight: 500,
                  }}
                >
                  {selectedEdge.relType}
                </div>
              </div>
              {selectedEdge.description && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>描述</div>
                  <div style={{ fontSize: "14px", lineHeight: "1.6" }}>{selectedEdge.description}</div>
                </div>
              )}
              {(selectedEdge.startChapter || selectedEdge.endChapter) && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>时间线</div>
                  <div style={{ fontSize: "14px" }}>
                    {selectedEdge.startChapter && `第 ${selectedEdge.startChapter} 章开始`}
                    {selectedEdge.startChapter && selectedEdge.endChapter && " → "}
                    {selectedEdge.endChapter && `第 ${selectedEdge.endChapter} 章结束`}
                  </div>
                </div>
              )}
              <div style={{ marginTop: "12px", fontSize: "12px", color: "#64748b" }}>
                状态：
                <span
                  style={{
                    marginLeft: "6px",
                    color: selectedEdge.status === "active" ? "#22c55e" : "#64748b",
                  }}
                >
                  {selectedEdge.status === "active" ? "进行中" : selectedEdge.status}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CharacterRelationGraph;
