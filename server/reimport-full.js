const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('dev.db');
const novelId = 'cmqsckuse0000govrpy4yo9ud';

// Read original file
const raw = fs.readFileSync('/Users/lingoace/Downloads/人在阳间打工，老祖阴间享福.txt', 'utf8');
const lines = raw.split('\n');

// Helper: extract text between line ranges (0-indexed after split, but file uses 1-indexed display)
function extract(startLine, endLine) {
  return lines.slice(startLine - 1, endLine).join('\n').trim();
}

console.log('=== 1. 更新 Character rawProfile（完整原文） ===');
const charProfiles = {
  '林凡': extract(3, 270),
  '林富贵': extract(271, 458),   // 包含老祖高光时刻
  '陆清菲': extract(459, 639),
  '王德发': extract(640, 834),
  '萧慕晴': extract(835, 1044),
  '钟少府': extract(1945, 2171),
};

for (const [name, profile] of Object.entries(charProfiles)) {
  const r = db.prepare('UPDATE Character SET rawProfile = ? WHERE novelId = ? AND name = ?')
    .run(profile, novelId, name);
  console.log(`  ${name}: ${profile.length} chars, updated ${r.changes} rows`);
}

console.log('\n=== 2. 更新 KnowledgeAsset（完整原文） ===');
const assets = {
  'overall_planning': { title: '整体规划', content: extract(1193, 1255) },
  'creation_document': { title: '完整创作文档', content: extract(1256, 1546) },
  'hook_table': { title: '钩子预埋与回收全表', content: extract(1547, 1725) },
  'constraint_rules': { title: '强制约束规则', content: extract(1726, 1944) },
};

for (const [category, data] of Object.entries(assets)) {
  const existing = db.prepare('SELECT id FROM KnowledgeAsset WHERE novelId = ? AND category = ?').get(novelId, category);
  if (existing) {
    db.prepare('UPDATE KnowledgeAsset SET content = ?, title = ?, updatedAt = datetime(\'now\') WHERE id = ?')
      .run(data.content, data.title, existing.id);
    console.log(`  ${data.title}: ${data.content.length} chars (updated)`);
  } else {
    const id = 'ka_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    db.prepare('INSERT INTO KnowledgeAsset (id, novelId, category, title, content, createdAt, updatedAt) VALUES (?,?,?,?,?,datetime(\'now\'),datetime(\'now\'))')
      .run(id, novelId, category, data.title, data.content);
    console.log(`  ${data.title}: ${data.content.length} chars (created)`);
  }
}

console.log('\n=== 3. 更新 Novel 核心卖点（用原文完整版） ===');
const sellingPoint = extract(1168, 1193);
db.prepare('UPDATE Novel SET coreSellingPoint = ?, updatedAt = datetime(\'now\') WHERE id = ?')
  .run(sellingPoint, novelId);
console.log('  coreSellingPoint:', sellingPoint.length, 'chars');

// 核心卖点原文单独区域
const coreSellingPointSection = extract(1168, 1193);
console.log('  核心卖点区域:', coreSellingPointSection.length, 'chars');

db.close();
console.log('\n=== 完成 ===');
