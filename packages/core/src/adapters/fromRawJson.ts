// 現有 JSON → 領域模型。日後也是把 JSON 匯入資料庫的轉換程式。
import type { DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, Exercise, Session } from '../domain/types';
import type { RawJournals, RawTrainingData, RawVideos } from '../schema/raw';

/** 去掉日誌原文第一行的「# 日期」標題 */
export const stripJournalHeading = (text: string) => text.replace(/^#[^\n]*\n+/, '');

export function fromRawJson(
  raw: RawTrainingData,
  rawJournals: RawJournals = {},
  rawVideos: RawVideos = { videos: [] },
): Dataset {
  const exercises: Exercise[] = raw.exercises.map((e, order) => ({
    id: e.id,
    name: e.name,
    group: e.group,
    ...(e.icon ? { icon: e.icon } : {}),
    notes: e.notes ?? [],
    kind: e.kind === 'cardio' ? 'cardio' : 'strength',
    ...(e.rep_unit ? { repUnit: e.rep_unit } : {}),
    ...(e.zero_label ? { zeroLabel: e.zero_label } : {}),
    order,
  }));
  const entriesByExercise = new Map<string, Entry[]>();
  const entriesByDate = new Map<DateStr, Entry[]>();
  raw.exercises.forEach((e) => {
    const list = e.history.map((h): Entry => ({
      id: `${e.id}@${h.date}`,
      exerciseId: e.id,
      date: h.date,
      sets: h.sets.map(([w, r]) => ({ weightKg: w, reps: r })),
      ...(h.sets_display ? { setsDisplay: h.sets_display } : {}),
      ...(h.feel ? { feel: h.feel } : {}),
      ...(h.exhaustion ? { exhaustion: h.exhaustion } : {}),
      ...(h.condition ? { condition: h.condition } : {}),
      ...(h.cue ? { cue: h.cue } : {}),
      ...(h.minutes !== undefined ? { minutes: h.minutes } : {}),
      ...(h.distance_km != null ? { distanceKm: h.distance_km } : {}),
    }));
    entriesByExercise.set(e.id, list);
    for (const en of list) {
      const day = entriesByDate.get(en.date);
      if (day) day.push(en);
      else entriesByDate.set(en.date, [en]);
    }
  });
  const trainingDates = [...entriesByDate.keys()].sort();
  const journals = new Map<DateStr, string>(Object.entries(rawJournals));
  const allDates = [...new Set([...trainingDates, ...journals.keys()])].sort();
  const sessions: Session[] = allDates.map((date) => ({
    date,
    entryIds: (entriesByDate.get(date) ?? []).map((en) => en.id),
    hasJournal: journals.has(date),
  }));
  const videosByDate = new Map<DateStr, DayVideo>(
    rawVideos.videos.map((v) => [
      v.date,
      {
        date: v.date,
        youtubeId: v.youtube_id,
        durationSec: v.duration_sec,
        // schema 已驗證是「寬x高」
        width: Number(v.canvas.split('x')[0]),
        height: Number(v.canvas.split('x')[1]),
        title: v.title,
        segments: v.segments.map((s) => ({
          exerciseId: s.exercise_id,
          start: s.start,
          end: s.end,
          label: s.label,
          ...(s.set != null ? { set: s.set } : {}),
          ...(s.side ? { side: s.side } : {}),
        })),
      },
    ]),
  );
  return {
    groupOrder: raw.meta.group_order,
    exercises,
    exerciseById: new Map(exercises.map((e) => [e.id, e])),
    entriesByExercise,
    entriesByDate,
    trainingDates,
    sessions,
    journals,
    videosByDate,
  };
}
