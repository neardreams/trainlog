// 領域模型：正規化後的資料結構，對應日後資料庫的四張表（exercises、sessions、entries、sets）。
// 畫面、計算邏輯、日後的 API 都使用這一層；欄位一律 camelCase、日期為本地 YYYY-MM-DD。
import type { DateStr } from '../dates';
import type { Muscle, Pattern } from './taxonomy';

export type ExerciseKind = 'strength' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  group: string;
  icon?: string;
  notes: string[];
  kind: ExerciseKind;
  /** 次數欄改為秒數或米數 */
  repUnit?: string;
  /** 重量為 0 時顯示的文字（空重／自重／空槓） */
  zeroLabel?: string;
  /** 重量記每邊（一手／一腳／一側），畫面顯示「kg/邊」 */
  perSide?: boolean;
  /** 重量記合計、次數記每邊（左右輪流做）：容量 ×2 */
  repsPerSide?: boolean;
  /** 同型動作的代號（同一個動作換器材或單雙邊）；沒有同型動作就沒有這個欄位 */
  family?: string;
  /** 不再做的動作（不列入久未練） */
  archived?: boolean;
  pattern?: Pattern;
  /** 主要肌群（沒標就是空陣列） */
  muscles: Muscle[];
  /** 次要肌群 */
  secondaryMuscles: Muscle[];
  /** 在原始資料中的順序（排序的穩定基準） */
  order: number;
}

export interface SetRow {
  weightKg: number | null;
  reps: number | null;
}

/** 某一天、某個動作的一筆紀錄 */
export interface Entry {
  id: string; // `${exerciseId}@${date}`
  exerciseId: string;
  date: DateStr;
  sets: SetRow[];
  /** 熱身組：和正式組分開顯示，不算進組數、容量、最高重量與破紀錄 */
  warmupSets?: SetRow[];
  setsDisplay?: string;
  feel?: string;
  exhaustion?: string;
  condition?: string;
  cue?: string;
  minutes?: number | null;
  distanceKm?: number;
  /** 有值時覆蓋動作的 perSide（同一動作混了啞鈴與槓鈴時） */
  perSide?: boolean;
  /** 當天第幾個做的動作（1 起算）；舊資料沒有時依動作主檔順序 */
  order?: number;
}

/** 當天熱身清單的一項（滾筒放鬆、伸展、活動度、啟動動作…） */
export interface WarmupItem {
  name: string;
  /** 組數、次數、秒數或部位，例如「2 組 × 10 下」「40 秒」 */
  detail?: string;
}

/** 訓練日（有訓練或有日誌的日子） */
export interface Session {
  date: DateStr;
  /** 當天的動作（依實際執行順序） */
  entryIds: string[];
  hasJournal: boolean;
}

/** 合併影片中的一段（YouTube 章節），對應某個動作的一組或一支原始片段 */
export interface VideoSegment {
  exerciseId: string;
  /** 在合併影片中的開始／結束秒數 */
  start: number;
  end: number;
  /** 章節標籤（不含動作名稱），例如「第 3 組 80kg×6」「片段 5」「暖身」 */
  label: string;
  set?: number;
  side?: '左' | '右';
}

/** 一個訓練日合併成的一支 YouTube 影片（不公開） */
export interface DayVideo {
  date: DateStr;
  youtubeId: string;
  durationSec: number;
  /** 畫面寬高（像素）；高 > 寬 是直式 */
  width: number;
  height: number;
  title: string;
  segments: VideoSegment[];
}

export interface Dataset {
  groupOrder: string[];
  exercises: Exercise[];
  exerciseById: ReadonlyMap<string, Exercise>;
  /** 每個動作的紀錄，依日期由舊到新 */
  entriesByExercise: ReadonlyMap<string, Entry[]>;
  /** 每一天的紀錄，依實際執行順序（order；沒有 order 時依動作主檔順序） */
  entriesByDate: ReadonlyMap<DateStr, Entry[]>;
  /** 有訓練的日期，由舊到新（不含只有日誌的日子） */
  trainingDates: DateStr[];
  sessions: Session[];
  journals: ReadonlyMap<DateStr, string>;
  /** 每個訓練日的合併影片（沒有影片的日子不在裡面） */
  videosByDate: ReadonlyMap<DateStr, DayVideo>;
  /** 每天的熱身清單（沒記熱身的日子不在裡面） */
  warmupsByDate: ReadonlyMap<DateStr, WarmupItem[]>;
}
