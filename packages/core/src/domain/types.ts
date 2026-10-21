// 領域模型：正規化後的資料結構，對應日後資料庫的四張表（exercises、sessions、entries、sets）。
// 畫面、計算邏輯、日後的 API 都使用這一層；欄位一律 camelCase、日期為本地 YYYY-MM-DD。
import type { DateStr } from '../dates';

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
  setsDisplay?: string;
  feel?: string;
  exhaustion?: string;
  condition?: string;
  cue?: string;
  minutes?: number | null;
  distanceKm?: number;
}

/** 訓練日（有訓練或有日誌的日子） */
export interface Session {
  date: DateStr;
  /** 當天的動作（依原始資料的動作順序） */
  entryIds: string[];
  hasJournal: boolean;
}

export interface Dataset {
  groupOrder: string[];
  exercises: Exercise[];
  exerciseById: ReadonlyMap<string, Exercise>;
  /** 每個動作的紀錄，依日期由舊到新 */
  entriesByExercise: ReadonlyMap<string, Entry[]>;
  /** 每一天的紀錄，依動作順序 */
  entriesByDate: ReadonlyMap<DateStr, Entry[]>;
  /** 有訓練的日期，由舊到新（不含只有日誌的日子） */
  trainingDates: DateStr[];
  sessions: Session[];
  journals: ReadonlyMap<DateStr, string>;
}
