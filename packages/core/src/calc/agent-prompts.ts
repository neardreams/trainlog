// 給 AI 的固定分析框架（MCP prompts）：不同用戶端（Claude、ChatGPT、Gemini、Codex）接上 /mcp 都能套用同一套教練視角。
// 只產生文字，不讀資料；實際資料由 AI 依提示呼叫 AGENT_TOOLS 取得。

export interface AgentPromptArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface AgentPrompt {
  name: string;
  title: string;
  description: string;
  arguments: AgentPromptArg[];
  /** 依參數產生給 AI 的提示文字 */
  render: (args: Record<string, string | undefined>) => string;
}

const COMMON = [
  '資料說明：重量單位 kg；perSide＝重量記每邊；容量（volumeKg）左右兩邊都算，秒數／米數動作沒有容量（看 totalSec／totalMeters）。',
  'entries 依當天實際執行順序（order）；排在後面的動作是在疲勞下做的，比較重量時要考慮順序。',
  'e1rmKg 是推估 1RM（Epley，只算 1–12 下）；prs 的 kind：weight 最高重量、reps 同重量做更多下、e1rm 推估 1RM。',
  'rir／rirMin 是從感受文字解析的 RIR，左右分開記時有 side。',
  '回答用繁體中文（台灣用語），先講結論，再列依據（引用日期與組數），最後給具體可執行的建議。',
].join('\n');

const v = (s: string | undefined, fallback: string) => (s && s.trim() ? s.trim() : fallback);

export const AGENT_PROMPTS: AgentPrompt[] = [
  {
    name: 'analyze_training_day',
    title: '分析某天的訓練',
    description: '用一次查詢拿到某天的完整紀錄與每個動作的上次紀錄、先前最佳，分析表現、疲勞與下次調整。',
    arguments: [{ name: 'date', description: 'YYYY-MM-DD；不給＝最近一個訓練日' }],
    render: (a) =>
      [
        `請分析 ${v(a.date, '最近一個訓練日')} 的訓練。`,
        `步驟：呼叫 get_training_day（date: ${a.date?.trim() ? `"${a.date.trim()}"` : '不給'}，includeRecentHistory: true）。通常這一次就夠，不必再逐一查動作歷程。`,
        '分析重點：',
        '1. 每個動作和前兩次（recent.previous，新到舊）、先前最佳（recent.bestBefore）比：重量、次數、推估 1RM、RIR、力竭的走向是進步、停滯還是退步；有破紀錄就點出來。',
        '2. 執行順序的影響：預疲勞後做的動作，表現下降是否合理。',
        '3. 左右不對稱、疼痛或技術問題（feel、cue、condition、日誌原文）。',
        '4. 下次這些動作的重量／次數建議（依 RIR 與動作要點）。',
        COMMON,
      ].join('\n'),
  },
  {
    name: 'weekly_review',
    title: '本週回顧與下週建議',
    description: '本週訓練量、各動作模式與肌群的組數、RIR 與恢復狀況，並建議下週課表。',
    arguments: [{ name: 'days', description: '回顧最近幾天（預設 7）' }],
    render: (a) =>
      [
        `請回顧最近 ${v(a.days, '7')} 天的訓練，並建議下週課表。`,
        `步驟：get_period_stats（days: ${v(a.days, '7')}）→ get_weekly_volume（weeks: 8）看趨勢 → get_training_overview 看久未練的動作與各動作模式上次練的日期；需要細節時再用 get_training_day。`,
        '分析重點：',
        '1. 訓練量與上一段期間比（volumeKg、sets、setsByPattern、setsByMuscle）；哪些肌群組數偏少或偏多（一般肌肥大每週每肌群約 10–20 組）。',
        '2. RIR 分布與力竭比例是否太高、身心狀態（conditions）有沒有疲勞或傷痛訊號。',
        '3. 動作模式是否平衡（推／拉、蹲／髖鉸鏈、單邊）；久未練的模式。',
        '4. 有氧分鐘數與心率。',
        '5. 下週每個訓練日的建議（動作、組數、目標 RIR），沿用目前常做的動作。',
        COMMON,
      ].join('\n'),
  },
  {
    name: 'asymmetry_review',
    title: '單邊不對稱盤點',
    description: '找出左右不平衡、單邊比較弱或常出問題的一側，以及相關的疼痛與技術提醒。',
    arguments: [{ name: 'days', description: '回顧最近幾天（預設 60）' }],
    render: (a) =>
      [
        `請盤點最近 ${v(a.days, '60')} 天的左右不對稱。`,
        '步驟：search_notes 依序查「左」「右」「不平衡」「彈響」「痛」（加 from 限定期間）→ 對有問題的動作用 get_exercise_history（exercises 一次查多個）看 rir 的 side 與 feel。',
        '分析重點：',
        '1. 哪些動作、哪一側比較弱（RIR 左右差、力竭在哪一側、先做哪一側）。',
        '2. 反覆出現的疼痛或彈響（部位、在哪些動作、有沒有改善）。',
        '3. 教練提醒（cue）裡和單側有關的技術重點。',
        '4. 建議：弱側先做、單邊動作的比例、需要的啟動或矯正動作。',
        COMMON,
      ].join('\n'),
  },
  {
    name: 'exercise_progress',
    title: '動作進步分析',
    description: '某個動作（含同型動作）的長期進步：最高重量、推估 1RM、次數破紀錄與停滯期。',
    arguments: [{ name: 'exercise', description: '動作 id、名稱或關鍵字', required: true }],
    render: (a) =>
      [
        `請分析「${v(a.exercise, '')}」的長期進步。`,
        `步驟：get_exercise_history（exercise: "${v(a.exercise, '')}"，limit: 100，includeFamily: true）；若回傳 otherMatches，先確認是不是要的動作。`,
        '分析重點：',
        '1. 最高重量與推估 1RM 的走勢、各種破紀錄（weight／reps／e1rm）的時間點。',
        '2. 停滯或退步的期間，以及當時的感受、身心狀態、執行順序（order）。',
        '3. 同型動作（family）之間換來換去的影響。',
        '4. 接下來的進步策略（加重、加次數、換變化式）。',
        COMMON,
      ].join('\n'),
  },
];
