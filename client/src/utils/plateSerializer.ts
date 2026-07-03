import type { Value, Descendant } from "platejs";

/**
 * Plate Value -> 纯文本
 * 将 Plate.js 的 Value 格式序列化为纯文本字符串
 */
export function serializeToText(value: Value): string {
  return value.map(node => nodeToText(node)).join("\n");
}

function nodeToText(node: Descendant): string {
  // 叶子节点（文本节点）
  if ("text" in node) {
    return node.text as string;
  }

  // 元素节点（段落、标题等）
  const element = node as any;
  const children = (element.children || [])
    .map((child: any) => nodeToText(child))
    .join("");

  // 段落和标题之间不加额外换行（外层已处理）
  return children;
}

/**
 * 纯文本 -> Plate Value
 * 将纯文本字符串反序列化为 Plate.js 的 Value 格式
 */
export function deserializeFromText(text: string): Value {
  if (!text) {
    return [{ type: "p", children: [{ text: "" }] }];
  }

  const lines = text.split("\n");
  return lines.map(line => ({
    type: "p",
    children: [{ text: line }],
  }));
}
