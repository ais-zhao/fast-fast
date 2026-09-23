#!/usr/bin/env python3
"""Print a JSON snapshot of Shanghai/Shenzhen A-shares for the desk scanner."""

from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("TQDM_DISABLE", "1")

# Clash / local HTTP proxies often break mainland quote hosts. Always hit them directly.
for _key in (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
):
    os.environ.pop(_key, None)
os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"


def as_float(value: object) -> float | None:
    if value is None or value == "" or value == "-":
        return None
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # NaN check


def normalize_code(raw: object) -> str | None:
    text = str(raw or "").strip().lower()
    if text.startswith(("sh", "sz", "bj")):
        text = text[2:]
    if len(text) == 6 and text.isdigit():
        if text.startswith(("8", "4", "9", "200")):
            return None
        return text
    return None


def rows_from_tencent(frame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for item in frame.to_dict(orient="records"):
        code = normalize_code(item.get("code"))
        last = as_float(item.get("zxj"))
        change = as_float(item.get("zdf"))
        if not code or last is None or last <= 0 or change is None:
            continue
        rows.append(
            {
                "code": code,
                "name": str(item.get("name") or code),
                "last": last,
                "changePct": change,
                "volumeRatio": as_float(item.get("lb")),
                "turnoverRatio": as_float(item.get("hsl")),
            }
        )
    return rows


def rows_from_sina(frame) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for item in frame.to_dict(orient="records"):
        code = normalize_code(item.get("代码"))
        last = as_float(item.get("最新价"))
        change = as_float(item.get("涨跌幅"))
        if not code or last is None or last <= 0 or change is None:
            continue
        rows.append(
            {
                "code": code,
                "name": str(item.get("名称") or code),
                "last": last,
                "changePct": change,
                "volumeRatio": None,
                "turnoverRatio": as_float(item.get("换手率")),
            }
        )
    return rows


def main() -> int:
    try:
        import akshare as ak
    except ImportError:
        json.dump({"error": "未安装 akshare，请先 pip install -r requirements.txt"}, sys.stdout, ensure_ascii=False)
        return 2

    via = "akshare"
    rows: list[dict[str, object]] = []
    try:
        rows = rows_from_tencent(ak.stock_zh_a_spot_tx())
        via = "akshare"
    except Exception as tx_error:
        print(f"akshare tencent spot failed: {tx_error}", file=sys.stderr)
        try:
            rows = rows_from_sina(ak.stock_zh_a_spot())
            via = "akshare-sina"
        except Exception as sina_error:
            json.dump(
                {
                    "error": (
                        f"akshare 腾讯和新浪快照都失败：{sina_error}。"
                        "若错误里出现 127.0.0.1:7890，说明本机代理拦住了行情，"
                        "请 unset HTTP_PROXY HTTPS_PROXY ALL_PROXY 后重试，或 pull 最新分支（脚本已强制直连）。"
                    )
                },
                sys.stdout,
                ensure_ascii=False,
            )
            return 1

    json.dump({"via": via, "total": len(rows), "rows": rows}, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
