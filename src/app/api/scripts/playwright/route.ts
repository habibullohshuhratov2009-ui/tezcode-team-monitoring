import { NextResponse } from "next/server"

const SCRIPT = `#!/usr/bin/env python3
# Tezcode — Claude.ai usage via browser automation
# O'rnatish:
#   pip3 install playwright
#   python3 -m playwright install chromium
#   python3 ~/.tezcode_claude_usage.py

import json, sys, os, time
from pathlib import Path

COOKIES_FILE = Path.home() / ".tezcode_claude_cookies.json"
OUTPUT_FILE  = Path.home() / ".tezcode_claude_usage_cache.json"

def main():
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        print("[tezcode] playwright o'rnatilmagan: pip3 install playwright", file=sys.stderr)
        sys.exit(2)

    with sync_playwright() as p:
        has_cookies = COOKIES_FILE.exists()
        browser = p.chromium.launch(headless=has_cookies)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )

        if has_cookies:
            try:
                ctx.add_cookies(json.loads(COOKIES_FILE.read_text()))
            except Exception:
                COOKIES_FILE.unlink(missing_ok=True)
                has_cookies = False

        page = ctx.new_page()
        captured = []

        def on_response(resp):
            if "claude.ai" not in resp.url:
                return
            if "json" not in resp.headers.get("content-type", ""):
                return
            try:
                data = resp.json()
                captured.append({"url": resp.url, "data": data})
            except Exception:
                pass

        page.on("response", on_response)

        try:
            page.goto("https://claude.ai", timeout=30000)

            if not has_cookies:
                print("[tezcode] Brauzer ochildi — Claude.ai ga kiring...", file=sys.stderr)
                # Wait for chat input = logged in
                page.wait_for_selector("div[contenteditable], [data-testid='chat-input']", timeout=120000)
                cookies = ctx.cookies()
                COOKIES_FILE.write_text(json.dumps(cookies, indent=2))
                print("[tezcode] Login OK, cookies saqlandi", file=sys.stderr)

            page.wait_for_load_state("networkidle", timeout=10000)

            # Navigate to settings — usage data often loads here
            try:
                page.goto("https://claude.ai/settings", timeout=15000)
                page.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass

        except PWTimeout as e:
            print(f"[tezcode] Timeout: {e}", file=sys.stderr)
            browser.close()
            sys.exit(1)
        except Exception as e:
            if "net::ERR" in str(e):
                print(f"[tezcode] Login kerak — cookies eskirgan", file=sys.stderr)
                COOKIES_FILE.unlink(missing_ok=True)
            browser.close()
            sys.exit(1)

        # ── Parse captured API responses ──────────────────────────────
        result = {"sessionPercent": None, "weeklyTokens": None, "planName": None}

        for item in captured:
            url  = item["url"]
            data = item["data"]
            raw  = json.dumps(data).lower()

            # Usage / billing / entitlement endpoints
            if not any(k in url for k in ["/usage", "/billing", "/entitlement",
                                           "/account", "/plan", "/subscription",
                                           "/organization", "/limit"]):
                continue

            def dig(obj, *keys):
                for k in keys:
                    if isinstance(obj, dict) and k in obj:
                        obj = obj[k]
                    else:
                        return None
                return obj

            # Session percent
            for path in [
                ["usage", "session_percent"],
                ["session", "usage_percent"],
                ["rate_limit", "percent"],
                ["usage_percent"],
                ["percent"],
            ]:
                v = dig(data, *path)
                if isinstance(v, (int, float)):
                    result["sessionPercent"] = round(float(v))
                    break

            # Weekly tokens
            for path in [
                ["usage", "weekly_tokens"],
                ["weekly_output_tokens"],
                ["usage", "output_tokens"],
                ["tokens_used"],
            ]:
                v = dig(data, *path)
                if isinstance(v, (int, float)):
                    result["weeklyTokens"] = int(v)
                    break

            # Plan name
            for path in [["plan", "name"], ["subscription", "plan"], ["plan_name"]]:
                v = dig(data, *path)
                if isinstance(v, str):
                    result["planName"] = v
                    break

        # Save cache
        cache = {**result, "ts": time.time(), "captured_urls": [c["url"] for c in captured]}
        OUTPUT_FILE.write_text(json.dumps(cache, indent=2))

        browser.close()

    print(json.dumps(result))

if __name__ == "__main__":
    main()
`

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=tezcode-claude-usage.py",
    },
  })
}
