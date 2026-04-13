#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_journals.py — Apple Journal HTML → journals_raw.json 同步腳本

設計原則：重活腳本做，不浪費 LLM token。

比對機制：
- 用 HTML 原始檔的 MD5 hash 做差異偵測（存在 .sync_hashes.json）
- 這樣不管解析器怎麼改，只要 Apple 日誌的 HTML 沒變就不會誤判為「有變動」
- Apple 日誌重新匯出（HTML 變了）才會觸發更新

執行模式：
1. --init-baseline   首次執行，為所有現有條目建立 hash 基準，不動 JSON 內容
2. (預設) 全量掃描   比對每個 HTML 的 hash：
                     - 新條目 → 自動新增
                     - 舊條目 HTML 變了 → 寫入 pending_updates.json，由 Claude 問使用者
                     - hash 沒變 → 跳過
3. --apply-pending   套用使用者同意的 pending 更新
4. --dry-run         搭配任何模式使用，不寫入檔案

用法：
    # 首次建立 baseline（只記錄 hash，不改 JSON）
    python3 sync_journals.py --entries-dir <path> --data-dir <path> --init-baseline

    # 日常同步
    python3 sync_journals.py --entries-dir <path> --data-dir <path>

    # 套用使用者同意的更新
    python3 sync_journals.py --entries-dir <path> --data-dir <path> --apply-pending "2026-03-28,2026-02-10"
"""

import argparse
import json
import re
import hashlib
from html.parser import HTMLParser
from pathlib import Path


# ── HTML → 純文字解析器 ──────────────────────────────────────────────────────

class AppleJournalParser(HTMLParser):
    """從 Apple Journal 匯出的 HTML 中抽取結構化純文字。"""

    def __init__(self):
        super().__init__()
        self.result_lines = []
        self.current_text = ""
        self.in_body = False
        self.page_header = ""
        self.mood = ""
        self.category = ""
        self.div_stack = []
        self.skip_tags = {"style", "script", "head"}
        self.skip_depth = 0
        self.is_empty_paragraph = False
        self.in_p = False
        self.p_class = ""

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag in self.skip_tags:
            self.skip_depth += 1
            return
        if self.skip_depth > 0:
            return
        if tag == "body":
            self.in_body = True
            return
        if not self.in_body:
            return

        if tag == "div":
            cls = attrs_dict.get("class", "")
            self.div_stack.append(cls)
            if any(k in cls for k in ["pageHeader", "gridItemOverlayHeader", "gridItemOverlayFooter"]):
                self.current_text = ""

        if tag == "p":
            self.in_p = True
            self.p_class = attrs_dict.get("class", "")
            self.current_text = ""
            self.is_empty_paragraph = "p3" in self.p_class

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.skip_depth -= 1
            return
        if self.skip_depth > 0:
            return

        if tag == "div" and self.div_stack:
            cls = self.div_stack.pop()
            text = self.current_text.strip()
            if "pageHeader" in cls and text:
                self.page_header = text
            elif "gridItemOverlayHeader" in cls and text:
                self.mood = text
            elif "gridItemOverlayFooter" in cls and text:
                self.category = text

        if tag == "p" and self.in_p:
            if self.is_empty_paragraph:
                self.result_lines.append("")
            else:
                text = self.current_text.strip()
                if text and not text.startswith("<div") and not text.startswith("</div"):
                    self.result_lines.append(text)
            self.in_p = False
            self.current_text = ""

    def handle_data(self, data):
        if self.skip_depth > 0 or not self.in_body:
            return
        text = data.strip()
        if not text:
            return

        # pageHeader / overlay div 內的文字：只寫入 current_text，不進 result_lines
        if self.div_stack:
            top_cls = self.div_stack[-1]
            if any(k in top_cls for k in ["pageHeader", "gridItemOverlayHeader", "gridItemOverlayFooter"]):
                self.current_text += text
                return

        if self.in_p:
            if self.current_text and not self.current_text.endswith(" "):
                self.current_text += data.replace("\n", " ")
            else:
                self.current_text += text

    def get_markdown(self):
        """組合成 journals_raw.json 要求的 markdown 格式。"""
        header = f"# {self.page_header}" if self.page_header else ""

        meta_lines = []
        if self.mood:
            meta_lines.append(f"心情：{self.mood}")
        if self.category:
            meta_lines.append(f"分類：{self.category}")

        # 去除與 header/mood/category 重複的行
        dedupe_set = set()
        for val in [self.page_header, self.mood, self.category]:
            if val:
                dedupe_set.add(val.strip())

        body_lines = []
        prev_empty = False
        for line in self.result_lines:
            if line == "":
                if not prev_empty:
                    body_lines.append("")
                prev_empty = True
            elif line.strip() in dedupe_set:
                continue
            else:
                body_lines.append(line)
                prev_empty = False

        while body_lines and body_lines[0] == "":
            body_lines.pop(0)
        while body_lines and body_lines[-1] == "":
            body_lines.pop()

        parts = [p for p in [header, "\n".join(meta_lines), "\n".join(body_lines)] if p]
        return "\n\n".join(parts) + "\n"


def parse_html_file(filepath):
    """解析單一 Apple Journal HTML 檔案，回傳 markdown 文字。"""
    with open(filepath, "r", encoding="utf-8") as f:
        html_content = f.read()
    parser = AppleJournalParser()
    parser.feed(html_content)
    return parser.get_markdown()


def body_content_hash(filepath):
    """只 hash HTML <body> 裡的內容，忽略 head/style/meta。

    Apple Journal 每次匯出時 <head> 的 CSS class 定義可能會變動
    （例如多一個 span.s3），但 <body> 裡的實際內容不變。
    只 hash body 部分才能正確判斷「日誌內容是否真的有改動」。
    """
    with open(filepath, "r", encoding="utf-8") as f:
        html = f.read()

    # 擷取 <body>...</body> 之間的內容
    body_start = html.find("<body>")
    body_end = html.find("</body>")
    if body_start >= 0 and body_end >= 0:
        body = html[body_start:body_end + len("</body>")]
    else:
        body = html  # fallback: 整份 hash

    return hashlib.md5(body.encode("utf-8")).hexdigest()


# ── 主流程 ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="同步 Apple Journal HTML 到 journals_raw.json")
    ap.add_argument("--entries-dir", required=True, help="Apple 日誌 Entries 資料夾路徑")
    ap.add_argument("--data-dir", required=True, help="trainlog/data/ 資料夾路徑")
    ap.add_argument("--init-baseline", action="store_true",
                    help="首次執行：為所有現有條目建立 hash 基準 + 新增缺少的條目，不動已有的 JSON 內容")
    ap.add_argument("--apply-pending", default="",
                    help="套用指定日期的 pending 更新，逗號分隔，如 2026-03-28,2026-02-10")
    ap.add_argument("--dry-run", action="store_true", help="只顯示差異，不寫入")
    args = ap.parse_args()

    entries_dir = Path(args.entries_dir)
    data_dir = Path(args.data_dir)
    json_path = data_dir / "journals_raw.json"
    hash_path = data_dir / ".sync_hashes.json"
    pending_path = data_dir / ".pending_updates.json"

    # 讀取現有資料
    existing = json.loads(json_path.read_text(encoding="utf-8")) if json_path.exists() else {}
    hashes = json.loads(hash_path.read_text(encoding="utf-8")) if hash_path.exists() else {}

    # 掃描所有 HTML 檔
    date_pattern = re.compile(r"^(\d{4}-\d{2}-\d{2})\.html$")
    html_files = {}
    for f in sorted(entries_dir.glob("*.html")):
        m = date_pattern.match(f.name)
        if m:
            html_files[m.group(1)] = f

    # ── 模式 1：套用 pending 更新 ────────────────────────────────────────────
    if args.apply_pending:
        dates_to_apply = [d.strip() for d in args.apply_pending.split(",")]
        pending = json.loads(pending_path.read_text(encoding="utf-8")) if pending_path.exists() else {}
        applied = 0

        for date_str in dates_to_apply:
            if date_str in pending:
                if not args.dry_run:
                    existing[date_str] = pending[date_str]["new_content"]
                    hashes[date_str] = pending[date_str]["html_hash"]
                    del pending[date_str]
                print(f"  [套用] {date_str}")
                applied += 1
            else:
                print(f"  [略過] {date_str} — 不在 pending 清單中")

        if not args.dry_run:
            sorted_data = dict(sorted(existing.items()))
            json_path.write_text(json.dumps(sorted_data, ensure_ascii=False, indent=2), encoding="utf-8")
            hash_path.write_text(json.dumps(hashes, ensure_ascii=False, indent=2), encoding="utf-8")
            if pending:
                pending_path.write_text(json.dumps(pending, ensure_ascii=False, indent=2), encoding="utf-8")
            elif pending_path.exists():
                pending_path.unlink()

        print(f"\n已套用 {applied} 筆更新")
        return applied

    # ── 模式 2：init-baseline ────────────────────────────────────────────────
    if args.init_baseline:
        new_count = 0
        hash_count = 0

        for date_str, html_path in html_files.items():
            h = body_content_hash(html_path)

            # 記錄 hash
            hashes[date_str] = h
            hash_count += 1

            # 只新增 JSON 裡沒有的條目
            if date_str not in existing:
                new_content = parse_html_file(html_path)
                if not args.dry_run:
                    existing[date_str] = new_content
                print(f"  [新增] {date_str}")
                new_count += 1

        if not args.dry_run:
            sorted_data = dict(sorted(existing.items()))
            json_path.write_text(json.dumps(sorted_data, ensure_ascii=False, indent=2), encoding="utf-8")
            hash_path.write_text(json.dumps(hashes, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"\nBaseline 完成：建立 {hash_count} 筆 hash，新增 {new_count} 筆條目")
        return new_count

    # ── 模式 3：日常全量同步 ─────────────────────────────────────────────────
    stats = {"new": 0, "unchanged": 0}
    pending_updates = {}

    for date_str, html_path in html_files.items():
        current_hash = body_content_hash(html_path)
        stored_hash = hashes.get(date_str, "")

        # 新條目（JSON 裡沒有）
        if date_str not in existing:
            new_content = parse_html_file(html_path)
            if not args.dry_run:
                existing[date_str] = new_content
                hashes[date_str] = current_hash
            print(f"  [新增] {date_str}")
            stats["new"] += 1
            continue

        # 舊條目 — HTML 沒變就跳過
        if current_hash == stored_hash:
            stats["unchanged"] += 1
            continue

        # 舊條目 — HTML 有變動 → 放進 pending，讓 Claude 問使用者
        new_content = parse_html_file(html_path)
        pending_updates[date_str] = {
            "html_hash": current_hash,
            "old_hash": stored_hash,
            "new_content": new_content,
            "old_content_preview": existing[date_str][:200] + "...",
            "new_content_preview": new_content[:200] + "..."
        }
        print(f"  [待確認] {date_str} — HTML 來源已變動，需使用者確認")

    # 寫入
    if not args.dry_run:
        sorted_data = dict(sorted(existing.items()))
        json_path.write_text(json.dumps(sorted_data, ensure_ascii=False, indent=2), encoding="utf-8")
        hash_path.write_text(json.dumps(hashes, ensure_ascii=False, indent=2), encoding="utf-8")

        if pending_updates:
            pending_path.write_text(
                json.dumps(pending_updates, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        elif pending_path.exists():
            pending_path.unlink()

    # 報告
    pending_count = len(pending_updates)
    print(f"\n統計：新增 {stats['new']} | 未變動 {stats['unchanged']} | 待確認 {pending_count}")

    if pending_updates:
        print("\n以下條目的 Apple 日誌 HTML 已變動，需使用者確認是否更新：")
        for d in sorted(pending_updates.keys()):
            print(f"  - {d}")
        print(f"\n確認後執行：python3 {__file__} --entries-dir ... --data-dir ... --apply-pending \"日期1,日期2\"")

    return stats["new"] + pending_count


if __name__ == "__main__":
    changes = main()
    # 退出碼：0 = 有變動或全部完成，讓呼叫端知道是否需要重新生成
    exit(0)
