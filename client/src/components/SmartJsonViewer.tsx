import React, { useState } from "react";
import { defaultLabelMap, snakeCaseToReadable } from "../utils/translate";

interface SmartJsonViewerProps {
  data: any;
  labelMap?: Record<string, string>;
  maxDepth?: number;
  className?: string;
}

/**
 * 智能JSON展示组件
 * 根据数据类型智能选择展示方式：
 * - 简单对象：表格展示
 * - 数组：列表展示
 * - 复杂嵌套：树形展示
 */
// 合并外部 labelMap 与内置 defaultLabelMap，外部优先
const resolveLabel = (key: string, externalMap: Record<string, string>): string => {
  if (externalMap[key]) return externalMap[key];
  if (defaultLabelMap[key]) return defaultLabelMap[key];
  return snakeCaseToReadable(key);
};

export const SmartJsonViewer: React.FC<SmartJsonViewerProps> = ({
  data,
  labelMap = {},
  maxDepth = 3,
  className = "",
}) => {
  if (data === null || data === undefined) {
    return <div className="json-empty">暂无数据</div>;
  }

  if (typeof data === "string") {
    // 尝试解析JSON字符串
    try {
      const parsed = JSON.parse(data);
      return <SmartJsonViewer data={parsed} labelMap={labelMap} maxDepth={maxDepth} className={className} />;
    } catch {
      // 纯文本
      return <div className="json-text">{data}</div>;
    }
  }

  if (typeof data === "number" || typeof data === "boolean") {
    return <div className="json-primitive">{String(data)}</div>;
  }

  if (Array.isArray(data)) {
    return (
      <JsonArrayViewer
        data={data}
        labelMap={labelMap}
        maxDepth={maxDepth}
        className={className}
      />
    );
  }

  if (typeof data === "object") {
    return (
      <JsonObjectViewer
        data={data}
        labelMap={labelMap}
        maxDepth={maxDepth}
        className={className}
      />
    );
  }

  return <div className="json-unknown">{String(data)}</div>;
};

// 对象展示组件
const JsonObjectViewer: React.FC<{
  data: Record<string, any>;
  labelMap: Record<string, string>;
  maxDepth: number;
  className: string;
}> = ({ data, labelMap, maxDepth, className }) => {
  const entries = Object.entries(data);

  if (entries.length === 0) {
    return <div className="json-empty-object">空对象</div>;
  }

  // 简单对象（所有值都是基本类型）使用表格展示
  const isSimple = entries.every(([_, v]) =>
    v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
  );

  if (isSimple) {
    return (
      <table className={`json-table ${className}`}>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="json-key">{resolveLabel(key, labelMap)}</td>
              <td className="json-value">
                {value === null || value === undefined ? (
                  <span className="json-null">未设置</span>
                ) : typeof value === "boolean" ? (
                  <span className={`json-boolean ${value ? "true" : "false"}`}>
                    {value ? "是" : "否"}
                  </span>
                ) : (
                  <span>{String(value)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // 复杂对象使用树形展示
  return (
    <div className={`json-tree ${className}`}>
      {entries.map(([key, value]) => (
        <TreeNode
          key={key}
          label={resolveLabel(key, labelMap)}
          value={value}
          labelMap={labelMap}
          maxDepth={maxDepth}
          depth={0}
        />
      ))}
    </div>
  );
};

// 数组展示组件
const JsonArrayViewer: React.FC<{
  data: any[];
  labelMap: Record<string, string>;
  maxDepth: number;
  className: string;
}> = ({ data, labelMap, maxDepth, className }) => {
  if (data.length === 0) {
    return <div className="json-empty-array">空列表</div>;
  }

  // 简单数组（所有元素都是基本类型）使用列表展示
  const isSimple = data.every((item) =>
    item === null || item === undefined || typeof item === "string" || typeof item === "number" || typeof item === "boolean"
  );

  if (isSimple) {
    return (
      <ul className={`json-list ${className}`}>
        {data.map((item, index) => (
          <li key={index} className="json-list-item">
            {item === null || item === undefined ? (
              <span className="json-null">-</span>
            ) : (
              <span>{String(item)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  // 对象数组使用卡片列表展示
  const isObjectArray = data.every((item) => typeof item === "object" && item !== null);

  if (isObjectArray) {
    return (
      <div className={`json-card-list ${className}`}>
        {data.map((item, index) => (
          <div key={index} className="json-card">
            <div className="json-card-header">
              <span className="json-card-index">#{index + 1}</span>
            </div>
            <div className="json-card-body">
              <SmartJsonViewer
                data={item}
                labelMap={labelMap}
                maxDepth={maxDepth - 1}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 混合数组使用树形展示
  return (
    <div className={`json-tree ${className}`}>
      {data.map((item, index) => (
        <TreeNode
          key={index}
          label={`[${index}]`}
          value={item}
          labelMap={labelMap}
          maxDepth={maxDepth}
          depth={0}
        />
      ))}
    </div>
  );
};

// 树形节点组件
const TreeNode: React.FC<{
  label: string;
  value: any;
  labelMap: Record<string, string>;
  maxDepth: number;
  depth: number;
}> = ({ label, value, labelMap, maxDepth, depth }) => {
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null || value === undefined) {
    return (
      <div className="tree-node">
        <span className="tree-label">{label}</span>
        <span className="tree-value json-null">未设置</span>
      </div>
    );
  }

  if (typeof value !== "object") {
    return (
      <div className="tree-node">
        <span className="tree-label">{label}</span>
        <span className="tree-value">
          {typeof value === "boolean" ? (value ? "是" : "否") : String(value)}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const isEmpty = entries.length === 0;

  if (isEmpty) {
    return (
      <div className="tree-node">
        <span className="tree-label">{label}</span>
        <span className="tree-value json-empty">{isArray ? "[]" : "{}"}</span>
      </div>
    );
  }

  if (depth >= maxDepth) {
    return (
      <div className="tree-node">
        <span className="tree-label">{label}</span>
        <span className="tree-value json-truncated">
          {isArray ? `[${value.length} 项]` : `{${entries.length} 个字段}`}
        </span>
      </div>
    );
  }

  return (
    <div className="tree-branch">
      <div className="tree-node clickable" onClick={() => setExpanded(!expanded)}>
        <span className="tree-toggle">{expanded ? "▼" : "▶"}</span>
        <span className="tree-label">{label}</span>
        <span className="tree-count">
          {isArray ? `${value.length} 项` : `${entries.length} 个字段`}
        </span>
      </div>
      {expanded && (
        <div className="tree-children">
          {entries.map(([key, val]) => (
            <TreeNode
              key={key}
              label={isArray ? `[${key}]` : resolveLabel(key, labelMap)}
              value={val}
              labelMap={labelMap}
              maxDepth={maxDepth}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartJsonViewer;
