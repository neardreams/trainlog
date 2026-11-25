// wrangler 預設把 .txt 當成文字模組（import 進來是字串）；generated/dataset.txt 由 tools/prerender.mjs 產生
declare module '*.txt' {
  const text: string;
  export default text;
}
