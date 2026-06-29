import { parseMaterialSections } from "../MaterialSectionParser";

describe("parseMaterialSections", () => {
  it("recognizes major author-material sections", () => {
    const text = [
      "作品相关",
      "人物卡：林凡（男主）",
      "核心定位：林凡不是永远普通的执行者",
      "世界观",
      "世界观设定：《人在阳间享福，老祖阴间打工》",
      "核心卖点",
      "老祖阴间享福、后代阳间打工、双线成长",
      "整体规划",
      "总字数规划：100-200万字",
      "钩子预埋与回收全表",
      "| 编号 | 钩子名称 | 埋设位置 | 回收位置 | 内容 |",
      "强制约束规则",
      "# 《人在阳间享福，老祖阴间打工》强制约束规则",
    ].join("\n");

    const sections = parseMaterialSections(text);

    expect(sections.map(s => s.type)).toEqual([
      "character_card",
      "worldview",
      "core_selling_point",
      "overall_plan",
      "hook_table",
      "writing_constraints",
    ]);
  });

  it("skips canonical_chapters for short content", () => {
    const text = [
      "人物卡：林凡（男主）",
      "姓名：林凡",
      "第1章 他们当时的嘲笑声好大呀",
      "阴司大殿。",
    ].join("\n");

    const sections = parseMaterialSections(text);

    // Short content should not be detected as canonical chapters
    expect(sections.map(s => s.type)).not.toContain("canonical_chapters");
  });
});
