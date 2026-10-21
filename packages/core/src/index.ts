// @trainlog/core 公開 API（瀏覽器、App、日後的後端都可使用；不含任何 Node 專用模組）
export * from './dates';
export * from './domain/types';
export { fromRawJson, stripJournalHeading } from './adapters/fromRawJson';
export { parseDataset, type ParseResult } from './parse';
export * from './calc/sets';
export * from './calc/labels';
export * from './calc/exercises';
export * from './calc/days';
export * from './calc/dashboard';
export * from './calc/palette';
export * from './calc/misc';
export type { DataSource, WritableDataSource } from './ports/DataSource';
