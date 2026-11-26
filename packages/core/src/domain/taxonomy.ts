// 動作分類：動作模式（pattern）與肌群（muscles）。部位（group）是畫面用的粗分類，這裡是給統計與 AI 分析用的細分類。
// 新增值時同步改 SKILL.md 的「動作分類」與 CLAUDE.md 第 4 節。

/** 動作模式（英文代號，畫面與 AI 看 PATTERN_LABELS 的中文） */
export const PATTERNS = [
  'squat', // 雙腳蹲（膝主導）
  'lunge', // 單腳蹲、分腿蹲、弓箭步
  'hinge', // 髖鉸鏈：硬舉、RDL、擺盪
  'hip_thrust', // 臀推、臀橋
  'h_push', // 水平推：臥推、胸推、伏地挺身、雙槓
  'v_push', // 垂直推：肩推
  'h_pull', // 水平拉：划船、面拉
  'v_pull', // 垂直拉：下拉、引體向上
  'carry', // 負重行走：農夫走路、推雪橇
  'core', // 核心：棒式、捲腹、抗旋轉
  'isolation', // 單關節：腿伸展、腿後勾、彎舉、側平舉、夾胸、提踵…
  'activation', // 啟動／矯正：彈力繩外旋、風車、Arm Bar…
  'cardio', // 有氧
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  squat: '雙腳蹲',
  lunge: '單腳蹲／分腿',
  hinge: '髖鉸鏈',
  hip_thrust: '臀推',
  h_push: '水平推',
  v_push: '垂直推',
  h_pull: '水平拉',
  v_pull: '垂直拉',
  carry: '負重行走',
  core: '核心',
  isolation: '單關節',
  activation: '啟動／矯正',
  cardio: '有氧',
};

/** 肌群（統計用；主要肌群算 1 組、次要肌群算 0.5 組） */
export const MUSCLES = [
  '股四頭',
  '腿後',
  '臀',
  '內收',
  '髖外展',
  '小腿',
  '下背',
  '闊背',
  '上背',
  '斜方',
  '胸',
  '前三角',
  '側三角',
  '後三角',
  '肩袖',
  '前鋸',
  '二頭',
  '三頭',
  '前臂',
  '腹',
  '腹斜',
  '髖屈',
  '心肺',
] as const;
export type Muscle = (typeof MUSCLES)[number];
