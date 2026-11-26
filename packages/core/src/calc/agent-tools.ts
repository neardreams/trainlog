// 給 AI agent 的唯讀查詢工具（名稱、說明、輸入 JSON Schema、執行）。
// 同一份清單用在：網頁的 WebMCP（apps/web/src/lib/webmcp.ts）、Worker 的 /mcp 端點（apps/api）、llms.txt。
import type { DateStr } from '../dates';
import type { Dataset } from '../domain/types';
import {
  agentCompareDays,
  agentDay,
  agentExerciseHistory,
  agentExercisesHistory,
  agentJournals,
  agentListExercises,
  agentOverview,
  agentPeriodStats,
  agentPersonalRecords,
  agentSearchDays,
  agentSearchNotes,
  agentVideos,
  agentWeeklyVolume,
  type NoteSource,
} from './agent';
import { SORT_KEYS, type ExerciseStatus, type PrKind } from './exercises';
import { MUSCLES, PATTERN_LABELS, PATTERNS } from '../domain/taxonomy';

export interface JsonSchema {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  run: (ds: Dataset, today: DateStr, args: Record<string, unknown>) => unknown;
}

const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const oneOf = <T extends string>(v: unknown, list: readonly T[]) => list.find((x) => x === v);
const limit = (def: number, max = 500) => ({
  type: 'integer',
  minimum: 1,
  maximum: max,
  description: `最多幾筆（預設 ${def}）`,
});
const GROUP_DESC = '部位：腿部、背部、胸部、肩部、手臂、核心、髖部、有氧';
const PATTERN_DESC = `動作模式：${PATTERNS.map((p) => `${p}＝${PATTERN_LABELS[p]}`).join('、')}`;
const PR_KINDS: readonly PrKind[] = ['weight', 'reps', 'e1rm'];
const strs = (v: unknown) =>
  Array.isArray(v) ? v.flatMap((x) => (typeof x === 'string' && x.trim() ? [x.trim()] : [])) : undefined;
const STATUSES: readonly ExerciseStatus[] = ['7', '30', 'old'];
const SOURCES: readonly NoteSource[] = ['journal', 'entry', 'exercise'];

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'get_training_overview',
    description:
      '訓練總覽：資料期間、訓練日數（全部／近 7 天／近 30 天／本週 vs 上週同期）、連續訓練週數、各部位與各動作模式上次練的日期、久未練的動作（已排除不再做的、以及同型動作近期練過的）、最近 7 個訓練日摘要、最近 10 次破紀錄（weight 最高重量、reps 同重量更多下）。只分析某一天（今天、最近一次）時不必先呼叫這個，直接用 get_training_day。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ds, today) => agentOverview(ds, today),
  },
  {
    name: 'list_exercises',
    description:
      '列出動作（id、名稱、部位、動作模式 pattern、主要／次要肌群、同型動作代號 family、不再做 archived、訓練次數、上次訓練日、距今天數、最新重量、最高重量 kg、最佳推估 1RM、累計容量 kg、重量進步幅度、有氧總時間與距離、動作要點）。可依部位、動作模式、肌群、名稱關鍵字、最近練習狀態篩選並排序（overdue 找最久沒練的、progress 找進步最多的）。',
    inputSchema: {
      type: 'object',
      properties: {
        group: { type: 'string', description: GROUP_DESC },
        query: { type: 'string', description: '名稱或 id 關鍵字，例如「深蹲」「squat」' },
        pattern: { type: 'string', enum: PATTERNS, description: PATTERN_DESC },
        muscle: { type: 'string', enum: MUSCLES, description: '主要或次要肌群包含這個' },
        includeArchived: { type: 'boolean', description: '包含不再做的動作（預設 true）' },
        status: {
          type: 'string',
          enum: STATUSES,
          description: '7＝近 7 天練過、30＝8–30 天前、old＝超過 30 天沒練',
        },
        sort: {
          type: 'string',
          enum: SORT_KEYS,
          description:
            'group 依部位（預設）、recent 最近練的優先、overdue 最久沒練優先、maxwt 最高重量、volume 累計容量、sessions 訓練次數、progress 重量進步幅度、name 名稱',
        },
        limit: limit(500),
      },
      additionalProperties: false,
    },
    run: (ds, today, a) =>
      agentListExercises(ds, today, {
        group: str(a.group),
        query: str(a.query),
        status: oneOf(a.status, STATUSES),
        pattern: oneOf(a.pattern, PATTERNS),
        muscle: str(a.muscle),
        includeArchived: bool(a.includeArchived),
        sort: oneOf(a.sort, SORT_KEYS),
        limit: num(a.limit),
      }),
  },
  {
    name: 'get_exercise_history',
    description:
      '某個動作的歷程（最新在前）：摘要（次數、第一次與最近一次、最高重量與日期、最佳推估 1RM、進步幅度、有影片的天數），每次的日期、當天第幾個做（order）、組數（重量 kg × 次數）、最高重量、推估 1RM、容量、這次的破紀錄、感受與解析出的 RIR、力竭程度、教練提醒，以及所有破紀錄（weight／reps／e1rm）與同型動作清單。exercise 可以是 id、名稱或關鍵字（對到多個時附 otherMatches）；一次看多個動作用 exercises（回傳 results 陣列）。',
    inputSchema: {
      type: 'object',
      properties: {
        exercise: { type: 'string', description: '動作 id、名稱或關鍵字' },
        exercises: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: '一次查多個動作（id、名稱或關鍵字，最多 10 個）；回傳 { results: [...] }',
        },
        from: { ...date, description: '起日 YYYY-MM-DD（含）' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含）' },
        includeFamily: {
          type: 'boolean',
          description: '一併附上同型動作（同一個動作換器材或單雙邊）的紀錄',
        },
        limit: limit(20),
      },
      additionalProperties: false,
    },
    run: (ds, _t, a) => {
      const args = {
        exercise: str(a.exercise),
        exercises: strs(a.exercises),
        from: str(a.from),
        to: str(a.to),
        includeFamily: bool(a.includeFamily),
        limit: num(a.limit),
      };
      return args.exercises?.length ? agentExercisesHistory(ds, args) : agentExerciseHistory(ds, args);
    },
  },
  {
    name: 'get_training_day',
    description:
      '某一天的完整訓練紀錄，動作依實際執行順序：每個動作的組數、最高重量、推估 1RM、容量、破紀錄、感受與解析出的 RIR、力竭、身心狀態、教練提醒與影片段落（每段可直接跳到的 YouTube 網址），加上熱身清單、當天日誌全文、整支影片與網頁連結。date 不給（或給 latest）＝最近一個訓練日、today＝今天。分析某天的訓練時加 includeRecentHistory: true，會一併帶回每個動作的上一次紀錄、先前最佳、動作要點與同型動作的最近一次，通常就不必再逐一呼叫 get_exercise_history。沒有紀錄時回傳前後最近的訓練日。',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          pattern: '^(\\d{4}-\\d{2}-\\d{2}|latest|today)$',
          description: '日期 YYYY-MM-DD、latest（預設，最近一個訓練日）或 today',
        },
        includeRecentHistory: {
          type: 'boolean',
          description:
            '每個動作附上 recent：上一次紀錄、先前最佳重量與推估 1RM、動作要點、同型動作的最近一次',
        },
        includeJournal: {
          type: 'boolean',
          description: '附上日誌全文（預設 true；只看數據時設 false 省資料量）',
        },
      },
      additionalProperties: false,
    },
    run: (ds, today, a) =>
      agentDay(ds, str(a.date), {
        includeRecentHistory: bool(a.includeRecentHistory),
        includeJournal: bool(a.includeJournal),
        today,
      }),
  },
  {
    name: 'search_training_days',
    description:
      '搜尋訓練日（最新在前），可依日期區間、動作、部位、有沒有影片篩選；每天回傳部位、動作清單、組數、容量、有沒有日誌、影片網址與網頁連結，可選擇附上日誌全文。要看某天每組的細節再呼叫 get_training_day。',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...date, description: '起日 YYYY-MM-DD（含）' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含）' },
        exercise: { type: 'string', description: '只要有做這個動作的日子（id、名稱或關鍵字）' },
        group: { type: 'string', description: '只要有練這個部位的日子' },
        hasVideo: { type: 'boolean', description: 'true＝只要有影片的日子、false＝只要沒影片的日子' },
        includeJournal: { type: 'boolean', description: '每天附上日誌全文（資料量較大，建議搭配 limit）' },
        limit: limit(30),
      },
      additionalProperties: false,
    },
    run: (ds, _t, a) =>
      agentSearchDays(ds, {
        from: str(a.from),
        to: str(a.to),
        exercise: str(a.exercise),
        group: str(a.group),
        hasVideo: bool(a.hasVideo),
        includeJournal: bool(a.includeJournal),
        limit: num(a.limit),
      }),
  },
  {
    name: 'get_journals',
    description:
      '讀日誌全文（Apple 日誌原文，新到舊），包含沒有訓練、只寫了日誌的日子；每篇附當天動作、影片網址與網頁連結。可依日期區間與關鍵字篩選。要找某句話出現在哪裡、但不需要全文時，用 search_notes 比較省。',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...date, description: '起日 YYYY-MM-DD（含）' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含）' },
        query: { type: 'string', description: '只要包含這些關鍵字的日誌（空白分隔＝都要出現）' },
        limit: limit(10, 100),
      },
      additionalProperties: false,
    },
    run: (ds, _t, a) =>
      agentJournals(ds, { from: str(a.from), to: str(a.to), query: str(a.query), limit: num(a.limit) }),
  },
  {
    name: 'get_period_stats',
    description:
      '一段期間的統計：訓練日數、組數、容量、各部位組數、各動作模式組數、各肌群組數（主要肌群算 1、次要 0.5）、力竭分布、RIR 分布（從感受文字解析）、有氧分鐘數與平均心率、做過的動作與次數、非「正常」的身心狀態、破紀錄、訓練日清單，並附上前一段同長度期間的數字方便比較。用 from/to 指定期間，或用 days 表示最近 N 天（預設 30）。',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...date, description: '起日 YYYY-MM-DD（含）' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含，預設今天）' },
        days: { type: 'integer', minimum: 1, maximum: 3660, description: '沒給 from 時：最近 N 天' },
      },
      additionalProperties: false,
    },
    run: (ds, today, a) =>
      agentPeriodStats(ds, today, { from: str(a.from), to: str(a.to), days: num(a.days) }),
  },
  {
    name: 'get_weekly_volume',
    description:
      '每週（週一到週日）的訓練日數、組數、容量 kg、破紀錄次數（prCount 最高重量、repPrCount 同重量更多下），舊到新，最後一週是本週。看訓練量趨勢用。',
    inputSchema: {
      type: 'object',
      properties: { weeks: { type: 'integer', minimum: 1, maximum: 104, description: '幾週（預設 12）' } },
      additionalProperties: false,
    },
    run: (ds, today, a) => agentWeeklyVolume(ds, today, { weeks: num(a.weeks) }),
  },
  {
    name: 'get_personal_records',
    description:
      '破紀錄事件，新到舊，kind 分三種：weight＝最高重量超過先前所有紀錄；reps＝在某個重量（或更重）做到的次數超過先前所有紀錄（秒數／米數動作是撐更久、走更遠）；e1rm＝推估 1RM（Epley，只算 1–12 下）超過先前所有紀錄。另列每個動作目前的最高重量與最佳推估 1RM。可依動作、部位、種類、日期區間篩選。有氧不計。',
    inputSchema: {
      type: 'object',
      properties: {
        exercise: { type: 'string', description: '動作 id、名稱或關鍵字' },
        kind: { type: 'string', enum: PR_KINDS, description: 'weight／reps／e1rm；不給＝全部' },
        group: { type: 'string', description: GROUP_DESC },
        from: { ...date, description: '起日 YYYY-MM-DD（含）' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含）' },
        limit: limit(50),
      },
      additionalProperties: false,
    },
    run: (ds, _t, a) =>
      agentPersonalRecords(ds, {
        exercise: str(a.exercise),
        group: str(a.group),
        kind: oneOf(a.kind, PR_KINDS),
        from: str(a.from),
        to: str(a.to),
        limit: num(a.limit),
      }),
  },
  {
    name: 'compare_training_days',
    description:
      '比較兩天的訓練：各自的動作與組數，每個動作在另一天的最高重量與容量（沒做則為 null），兩天總容量與共同動作數。',
    inputSchema: {
      type: 'object',
      properties: {
        a: { ...date, description: '第一天 YYYY-MM-DD' },
        b: { ...date, description: '第二天 YYYY-MM-DD' },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
    run: (ds, _t, a) => agentCompareDays(ds, str(a.a) ?? '', str(a.b) ?? ''),
  },
  {
    name: 'search_notes',
    description:
      '全文搜尋：日誌原文、每筆紀錄的感受／教練提醒／身心狀態／力竭程度、動作要點。空白分隔的關鍵字都要出現（例如「右肩 痛」「握力」「RIR」）。用來找某個感覺、傷痛、技術提醒出現在哪些日子。新到舊。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '關鍵字（空白分隔＝都要出現）' },
        from: { ...date, description: '起日 YYYY-MM-DD（含）；有日期區間時不搜動作要點' },
        to: { ...date, description: '迄日 YYYY-MM-DD（含）' },
        sources: {
          type: 'array',
          items: { type: 'string', enum: SOURCES },
          description: 'journal＝日誌原文、entry＝紀錄備註、exercise＝動作要點；預設全部',
        },
        limit: limit(30, 200),
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: (ds, _t, a) =>
      agentSearchNotes(ds, {
        query: str(a.query) ?? '',
        from: str(a.from),
        to: str(a.to),
        sources: Array.isArray(a.sources) ? a.sources.flatMap((x) => oneOf(x, SOURCES) ?? []) : undefined,
        limit: num(a.limit),
      }),
  },
  {
    name: 'get_videos',
    description:
      '訓練影片（YouTube 不公開影片）：給 date 回傳那天的影片與每一段（動作、第幾組、開始秒數、直接跳到那段的網址）；給 exercise 回傳這個動作所有拍了影片的日子；都不給則列出最近的影片。',
    inputSchema: {
      type: 'object',
      properties: {
        date: { ...date, description: '日期 YYYY-MM-DD' },
        exercise: { type: 'string', description: '動作 id、名稱或關鍵字' },
        limit: limit(20),
      },
      additionalProperties: false,
    },
    run: (ds, _t, a) =>
      agentVideos(ds, { date: str(a.date), exercise: str(a.exercise), limit: num(a.limit) }),
  },
];
