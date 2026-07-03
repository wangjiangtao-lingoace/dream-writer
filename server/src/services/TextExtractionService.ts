import fs from "fs";
import path from "path";

const MAX_CHARS = 12000;

/**
 * TextExtractionService - 文本提取服务
 *
 * 从 PDF / EPUB / TXT 文件中提取纯文本内容，
 * 统一输出为截断到 12000 字符的字符串。
 */
export class TextExtractionService {
  /**
   * 根据文件扩展名自动选择提取策略
   */
  async extract(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case ".txt":
        return this.extractTxt(filePath);
      case ".pdf":
        return this.extractPdf(filePath);
      case ".epub":
        return this.extractEpub(filePath);
      default:
        throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  /**
   * 提取 TXT 文件：去除 BOM，规范化换行
   */
  private async extractTxt(filePath: string): Promise<string> {
    let text = await fs.promises.readFile(filePath, "utf-8");

    // 去除 UTF-8 BOM
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }

    // 规范化换行符
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    return text.slice(0, MAX_CHARS);
  }

  /**
   * 提取 PDF 文件：使用 pdf-parse 提取文本
   */
  private async extractPdf(filePath: string): Promise<string> {
    const { PDFParse } = await import("pdf-parse");
    const buffer = await fs.promises.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();

    const text = result.text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return text.slice(0, MAX_CHARS);
  }

  /**
   * 提取 EPUB 文件：遍历 spine 获取所有章节文本并去除 HTML 标签
   */
  private async extractEpub(filePath: string): Promise<string> {
    const { EPub } = await import("epub2");
    const epub = await EPub.createAsync(filePath);

    const parts: string[] = [];
    const spine = epub.flow;

    for (const item of spine) {
      if (!item.id) continue;
      try {
        const raw = await epub.getChapterAsync(item.id);
        if (!raw) continue;
        // 去除 HTML 标签，保留文本
        const text = raw
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<\/div>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (text.length > 0) {
          parts.push(text);
        }
      } catch {
        // 跳过无法解析的章节（如图片章节）
        continue;
      }

      // 提前退出，避免提取过多内容
      if (parts.join("\n\n").length >= MAX_CHARS) break;
    }

    return parts.join("\n\n").slice(0, MAX_CHARS);
  }
}

export const textExtractionService = new TextExtractionService();
