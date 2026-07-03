import {
  CHAPTER_TITLE_STYLE_RULES,
  buildChapterRangeDescription,
  calculateChapterOutlineStartOrder,
} from "../chapterOutlinesPhase";

describe("chapter outline continuation helpers", () => {
  it("starts generated outlines after canonical chapters", () => {
    expect(calculateChapterOutlineStartOrder(0, 10, 3)).toBe(4);
    expect(calculateChapterOutlineStartOrder(1, 10, 3)).toBe(14);
  });

  it("describes the real global chapter range after canonical chapters", () => {
    expect(buildChapterRangeDescription(0, 0, 10, 3)).toBe(
      "请为第1卷的全书第4到第13章设计详细章纲。前3章是用户原文，必须只承接，不得重新规划或改写。",
    );
    expect(buildChapterRangeDescription(1, 10, 20, 3)).toBe(
      "请为第2卷的全书第24到第33章设计详细章纲。前3章是用户原文，必须只承接，不得重新规划或改写。",
    );
  });

  it("keeps generated chapter titles close to user-original title style", () => {
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("不得像章纲说明");
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("他们当时的嘲笑声好大呀");
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("上香");
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("第一个任务");
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("PPT");
    expect(CHAPTER_TITLE_STYLE_RULES).toContain("KPI");
  });
});
