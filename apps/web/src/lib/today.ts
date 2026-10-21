// 「今天」在載入時決定一次（E2E 測試用 page.clock 固定時間）
import { todayStr } from '@trainlog/core';

export const TODAY = todayStr();
