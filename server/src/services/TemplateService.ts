// 小说模板系统

export interface NovelTemplate {
  id: string;
  name: string;
  genre: string;
  description: string;
  tags: string[];
  
  // 基础设定
  inspiration: string;
  outline: string;
  
  // 世界观模板
  worldview: {
    name: string;
    summary: string;
    rules: string;
    geography: string;
    factions: string;
    history: string;
  };
  
  // 人物模板
  characters: Array<{
    name: string;
    role: string;
    identity: string;
    motivation: string;
    appearance: string;
    background: string;
  }>;
  
  // 卷纲模板
  volumes: Array<{
    title: string;
    goal: string;
    conflict: string;
    emotion: string;
    mapName: string;
    endHook: string;
  }>;
  
  // 风格模板
  style: {
    narrativePov: string;
    tense: string;
    pacing: string;
    sentenceLength: string;
    dialogueRatio: string;
    emotionIntensity: string;
  };
  
  // 记忆模板
  memories: Array<{
    type: string;
    title: string;
    content: string;
    importance: number;
  }>;
}

export const NOVEL_TEMPLATES: NovelTemplate[] = [
  {
    id: "urban_xianxia",
    name: "都市修仙流",
    genre: "都市玄幻",
    description: "现代都市背景下的修仙故事，主角获得金手指后在都市中修炼升级",
    tags: ["都市", "修仙", "金手指", "逆袭"],
    inspiration: "一个生活不如意的都市青年，意外获得修仙传承，在都市中逆袭人生",
    outline: "主角获得修仙传承后，从底层开始修炼，逐步在都市中崛起，同时揭开修仙界的秘密",
    worldview: {
      name: "现代都市修仙界",
      summary: "表面是普通现代社会，暗中存在修仙者和异能者的世界",
      rules: "灵气稀薄，修仙困难；修仙者隐藏于都市；完成任务获得气运加持",
      geography: "现代大都市为主，后期可扩展到秘境、古迹、海外仙岛",
      factions: "都市普通人社会、隐藏的修仙家族、古武门派、老祖的仇家势力",
      history: "万年前仙界大战，老祖被围攻陨落，残魂流落人间。千年来灵气衰退，修仙者逐渐隐匿",
    },
    characters: [
      {
        name: "林逸",
        role: "主角",
        identity: "普通都市白领，某公司底层员工",
        motivation: "摆脱平庸生活，实现人生逆袭",
        appearance: "相貌普通，但眼神中透着不甘和倔强",
        background: "孤儿院长大，大学毕业后在大城市打拼，工作三年仍是基层员工",
      },
      {
        name: "玄清老祖",
        role: "导师",
        identity: "上古修仙大能，曾是渡劫期巅峰强者",
        motivation: "恢复实力，重返仙界报仇",
        appearance: "以灵魂形态出现，白发仙风道骨，气势威严",
        background: "万年前被仇家围攻，肉身毁灭，残魂寄于一枚古玉中",
      },
    ],
    volumes: [
      {
        title: "第一卷 觉醒篇",
        goal: "主角觉醒修仙能力，掌握基础修炼",
        conflict: "与恶势力的初次冲突，生存压力",
        emotion: "压抑→爆发→小爽",
        mapName: "现代都市",
        endHook: "发现古玉中的秘密，引出更大危机",
      },
      {
        title: "第二卷 崛起篇",
        goal: "主角实力提升，在都市中站稳脚跟",
        conflict: "与修仙家族的冲突，资源争夺",
        emotion: "紧张→爆发→大爽",
        mapName: "都市+秘境",
        endHook: "发现老祖的仇家势力",
      },
      {
        title: "第三卷 风云篇",
        goal: "主角进入修仙界，参与更大格局的争斗",
        conflict: "与修仙界势力的冲突",
        emotion: "压抑→高潮→转折",
        mapName: "修仙界",
        endHook: "揭开仙界大战的真相",
      },
    ],
    style: {
      narrativePov: "third_person",
      tense: "past",
      pacing: "fast",
      sentenceLength: "short",
      dialogueRatio: "high",
      emotionIntensity: "high",
    },
    memories: [
      {
        type: "world",
        title: "修仙体系",
        content: "炼气→筑基→金丹→元婴→化神→渡劫→大乘",
        importance: 9,
      },
      {
        type: "world",
        title: "气运体系",
        content: "完成任务获得气运，可转化为修为；桃花运、财运、好运等",
        importance: 8,
      },
      {
        type: "character",
        title: "主角性格",
        content: "坚韧不拔，善良但有些软弱，后期逐渐成长",
        importance: 7,
      },
    ],
  },
  {
    id: "xuanhuan_revenge",
    name: "玄幻复仇流",
    genre: "玄幻",
    description: "主角被害后重生或获得机缘，踏上复仇之路",
    tags: ["玄幻", "复仇", "重生", "逆袭"],
    inspiration: "天才少年被害，三年后重生归来，誓要讨回公道",
    outline: "主角被害后隐忍三年，获得机缘后开始复仇，逐步揭开更大的阴谋",
    worldview: {
      name: "玄幻大陆",
      summary: "以武为尊的世界，实力决定一切",
      rules: "修炼体系：武徒→武师→武王→武皇→武帝；境界越高，实力差距越大",
      geography: "大陆分为九域，每域有不同势力管辖",
      factions: "宗门、家族、王朝、暗势力",
      history: "千年前的上古大战，留下诸多遗迹和传承",
    },
    characters: [
      {
        name: "叶尘",
        role: "主角",
        identity: "曾经的天才，被害后沦为废物",
        motivation: "复仇，讨回公道，保护亲人",
        appearance: "面容冷峻，眼神中带着杀意",
        background: "叶家天才，被害后失去修为，被家族抛弃",
      },
      {
        name: "苏雪",
        role: "女主",
        identity: "苏家大小姐，主角的未婚妻",
        motivation: "帮助主角，守护爱情",
        appearance: "倾国倾城，气质高雅",
        background: "与主角青梅竹马，主角被害后仍不离不弃",
      },
    ],
    volumes: [
      {
        title: "第一卷 重生归来",
        goal: "主角重生，恢复修为",
        conflict: "与仇人的初次交锋",
        emotion: "隐忍→爆发→小爽",
        mapName: "叶家所在城市",
        endHook: "发现仇人背后有更大势力",
      },
      {
        title: "第二卷 复仇之路",
        goal: "主角开始复仇，击败仇人",
        conflict: "与仇人势力的全面对抗",
        emotion: "紧张→高潮→大爽",
        mapName: "所在域",
        endHook: "发现更大的阴谋",
      },
    ],
    style: {
      narrativePov: "third_person",
      tense: "past",
      pacing: "fast",
      sentenceLength: "short",
      dialogueRatio: "medium",
      emotionIntensity: "high",
    },
    memories: [
      {
        type: "world",
        title: "修炼体系",
        content: "武徒→武师→武王→武皇→武帝",
        importance: 9,
      },
      {
        type: "character",
        title: "主角性格",
        content: "隐忍、果断、恩怨分明",
        importance: 8,
      },
    ],
  },
  {
    id: "scifi_system",
    name: "科幻系统流",
    genre: "科幻",
    description: "主角获得系统，在科幻世界中发展",
    tags: ["科幻", "系统", "星际", "发展"],
    inspiration: "普通人在末世获得系统，带领人类走向星际",
    outline: "主角获得系统后，从末世开始发展，逐步带领人类走向星际文明",
    worldview: {
      name: "末世星际",
      summary: "末世爆发后，人类文明崩溃，主角带领幸存者重建文明",
      rules: "系统提供任务和奖励；科技与异能并存",
      geography: "从地球到星际",
      factions: "幸存者基地、变异兽、外星文明",
      history: "末世爆发的原因，外星文明的介入",
    },
    characters: [
      {
        name: "陈星",
        role: "主角",
        identity: "普通程序员，末世爆发时获得系统",
        motivation: "生存，保护亲人，带领人类走向星际",
        appearance: "普通长相，但眼神坚定",
        background: "末世前是普通程序员，末世爆发后获得系统",
      },
    ],
    volumes: [
      {
        title: "第一卷 末世求生",
        goal: "主角在末世中生存，建立基地",
        conflict: "与变异兽的战斗，资源争夺",
        emotion: "紧张→爆发→希望",
        mapName: "地球",
        endHook: "发现外星文明的踪迹",
      },
    ],
    style: {
      narrativePov: "first_person",
      tense: "past",
      pacing: "balanced",
      sentenceLength: "medium",
      dialogueRatio: "balanced",
      emotionIntensity: "medium",
    },
    memories: [
      {
        type: "world",
        title: "系统功能",
        content: "任务系统、奖励系统、升级系统",
        importance: 9,
      },
    ],
  },
  {
    id: "ancient_romance",
    name: "古代言情流",
    genre: "言情",
    description: "古代背景下的爱情故事",
    tags: ["古代", "言情", "宫斗", "宅斗"],
    inspiration: "现代女医生穿越到古代，成为将军府的废物小姐",
    outline: "主角穿越后，凭借现代知识和医术，在古代逆袭，同时收获爱情",
    worldview: {
      name: "古代王朝",
        summary: "架空古代王朝，男尊女卑，但女主改变命运",
        rules: "医术、武功、权谋并存",
        geography: "京城、边疆、江湖",
        factions: "皇室、将军府、江湖门派",
        history: "王朝建立的历史，各方势力的恩怨",
    },
    characters: [
      {
        name: "林婉儿",
        role: "女主",
        identity: "现代女医生，穿越成为将军府废物小姐",
        motivation: "活下去，改变命运，找到真爱",
        appearance: "倾国倾城，气质独特",
        background: "现代医学博士，穿越后成为被退婚的废物小姐",
      },
      {
        name: "萧战",
        role: "男主",
        identity: "战神将军，冷面王爷",
        motivation: "守护江山，保护女主",
        appearance: "英俊冷峻，气势逼人",
        background: "战功赫赫的将军，因误会与女主退婚",
      },
    ],
    volumes: [
      {
        title: "第一卷 穿越重生",
        goal: "主角穿越后站稳脚跟，展露医术",
        conflict: "与府中恶人的斗争",
        emotion: "隐忍→爆发→甜蜜",
        mapName: "京城",
        endHook: "与男主再次相遇",
      },
    ],
    style: {
      narrativePov: "third_person",
      tense: "past",
      pacing: "balanced",
      sentenceLength: "medium",
      dialogueRatio: "high",
      emotionIntensity: "medium",
    },
    memories: [
      {
        type: "world",
        title: "医术体系",
        content: "中医、针灸、草药、现代医学知识",
        importance: 8,
      },
    ],
  },
  {
    id: "urban_funny",
    name: "都市搞笑流",
    genre: "都市喜剧",
    description: "轻松搞笑的都市故事",
    tags: ["都市", "搞笑", "轻松", "日常"],
    inspiration: "普通上班族获得吐槽系统，生活变得鸡飞狗跳",
    outline: "主角获得吐槽系统后，生活变得搞笑又温馨",
    worldview: {
      name: "现代都市",
      summary: "普通现代都市，但有吐槽系统",
      rules: "吐槽获得奖励，吐槽值越高奖励越好",
      geography: "现代城市",
      factions: "公司、家庭、朋友圈",
      history: "无特殊历史",
    },
    characters: [
      {
        name: "张伟",
        role: "主角",
        identity: "普通上班族，社畜",
        motivation: "让生活更有趣，保护朋友",
        appearance: "普通长相，表情丰富",
        background: "普通大学毕业，普通工作，普通生活",
      },
    ],
    volumes: [
      {
        title: "第一卷 吐槽人生",
        goal: "主角获得系统，生活开始变化",
        conflict: "与奇葩同事的斗智斗勇",
        emotion: "搞笑→温馨→感动",
        mapName: "城市",
        endHook: "发现系统背后有更大秘密",
      },
    ],
    style: {
      narrativePov: "first_person",
      tense: "present",
      pacing: "fast",
      sentenceLength: "short",
      dialogueRatio: "high",
      emotionIntensity: "low",
    },
    memories: [
      {
        type: "world",
        title: "吐槽系统",
        content: "吐槽获得吐槽值，吐槽值可兑换奖励",
        importance: 9,
      },
    ],
  },
];

// 获取所有模板
export function getAllTemplates(): NovelTemplate[] {
  return NOVEL_TEMPLATES;
}

// 根据 ID 获取模板
export function getTemplateById(id: string): NovelTemplate | undefined {
  return NOVEL_TEMPLATES.find((t) => t.id === id);
}

// 根据类型筛选模板
export function getTemplatesByGenre(genre: string): NovelTemplate[] {
  return NOVEL_TEMPLATES.filter((t) => t.genre.includes(genre));
}

// 搜索模板
export function searchTemplates(keyword: string): NovelTemplate[] {
  const lower = keyword.toLowerCase();
  return NOVEL_TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(lower) ||
    t.description.toLowerCase().includes(lower) ||
    t.tags.some((tag) => tag.toLowerCase().includes(lower))
  );
}
