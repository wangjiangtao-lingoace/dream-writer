/**
 * 第七层：读者期待约束（动态）
 *
 * 从数据库 Novel.readerExpectations 动态生成。
 * 定义读者为什么追这本书，确保每章满足读者期待。
 */

/**
 * 构建第七层：读者期待约束
 */
export function buildLayer7ReaderExpect(readerExpectations?: string[]): string {
  if (!readerExpectations || readerExpectations.length === 0) {
    return '';
  }

  return `【读者期待约束】
读者打开这本书的原因：
${readerExpectations.map((r, i) => `${i + 1}. ${r}`).join('\n')}
本章至少满足其中两项。
如果没有满足：优先修改剧情，不要通过增加描写补字数。`;
}
