import { mapMaterialSections } from "../MaterialAssetMapper";
import { MaterialSection } from "../MaterialSectionParser";

describe("mapMaterialSections", () => {
  it("maps core selling point exactly as author corrected it", () => {
    const sections: MaterialSection[] = [{
      type: "core_selling_point",
      title: "核心卖点",
      content: "核心卖点\n老祖阴间享福、后代阳间打工、双线成长",
      startLine: 1,
      endLine: 2,
    }];

    const mapped = mapMaterialSections(sections);

    expect(mapped.novelPatch.coreSellingPoint).toBe("老祖阴间享福、后代阳间打工、双线成长");
    expect(mapped.novelPatch.corePayoffs).toContain("老祖阴间享福");
  });

  it("extracts deep character fields from structured card", () => {
    const sections: MaterialSection[] = [{
      type: "character_card",
      title: "人物卡：林富贵（老祖）",
      content: `人物卡：林富贵（老祖）
姓名：林富贵
阳间身份：林凡的八代老祖（约200至300年前）
阴间身份：基层阴差（开篇） → 阴间大佬（结局）
标签：表面高人 · 实际怂包 · 老阴逼
核心定位：怂但不坏，阴但不毒，装但不崩。
他会做的事：
- 在林凡面前吹嘘自己当年多厉害
- 遇到硬仗时第一时间想跑
他不会做的事：
- 真的背叛林凡
- 正面单挑任何对手
成长红线：
他可以变得更强，但永远保留"老阴逼"的行事风格。
能力体系：
（一）阴德兑换型
- 官职晋升
- 修为/鬼力提升
喜剧性格：
- 吹牛：把三分的事吹成十分
- 强行挽尊：被拆穿后死不承认
`,
      startLine: 1,
      endLine: 30,
    }];

    const mapped = mapMaterialSections(sections);

    expect(mapped.characters).toHaveLength(1);
    const char = mapped.characters[0];
    expect(char.name).toBe("林富贵");
    expect(char.role).toContain("老祖");
    expect(char.personality).toContain("怂但不坏");
    expect(char.behaviorRules).toContain("在林凡面前吹嘘自己当年多厉害");
    expect(char.forbiddenBehavior).toContain("真的背叛林凡");
    expect(char.arcDetail).toContain("永远保留");
    expect(char.abilities).toContain("阴德兑换型");
    expect(char.comedyMechanisms).toContain("吹牛");
    expect(char.background).toBeTruthy();
    expect(char.sourceType).toBe("user_original");
    expect(char.isCanonical).toBe(true);
  });

  it("handles missing fields gracefully", () => {
    const sections: MaterialSection[] = [{
      type: "character_card",
      title: "男主-林凡设定",
      content: `人物卡：林凡（男主）
姓名：林凡
核心定位：普通人逆袭
`,
      startLine: 1,
      endLine: 5,
    }];

    const mapped = mapMaterialSections(sections);

    expect(mapped.characters).toHaveLength(1);
    const char = mapped.characters[0];
    expect(char.name).toBe("林凡");
    expect(char.role).toBe("男主");
    expect(char.personality).toContain("普通人逆袭");
    expect(char.speechStyle).toBeFalsy();
    expect(char.signatureLines).toEqual([]);
    expect(char.abilities).toBe("");
  });
});
