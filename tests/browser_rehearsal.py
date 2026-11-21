"""Optional Chromium smoke test. Start a blank (no keys/feeds/cache) local
backend + Vite on default ports. Requires locally installed Python Playwright
and Chromium; does not install software or use public internet."""
import os
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = "http://127.0.0.1:5173"
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN", "/usr/bin/chromium"),
                                 args=["--disable-background-networking"])
    context = browser.new_context()
    context.route("**/*", lambda route: route.continue_() if urlparse(route.request.url).hostname
                  in ("127.0.0.1", "localhost") else route.abort())
    page = context.new_page()
    health = page.request.get(base + "/api/health").json()
    assert not any(health[k] for k in ("articles", "textModelConfigured", "ttsConfigured")), "Use an unconfigured rehearsal instance"
    assert page.request.get(base + "/api/memory").json()["synthetic"]
    errors = []
    audio_jobs = []
    def observe(request):
        if request.method == "POST" and request.url.endswith("/api/memory") and request.post_data_json.get("withAudio"):
            audio_jobs.append(request.url)
    page.on("request", observe)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    button = lambda name: page.get_by_role("button", name=name, exact=True)
    later = lambda: page.get_by_role("button", name=re.compile("NEXT EDITION")).click()
    first = lambda: page.get_by_role("button", name=re.compile("FIRST EDITION")).click()
    text = lambda msg: expect(page.get_by_text(msg, exact=True)).to_be_visible()
    button("Generate briefing").click()
    expect(page.get_by_role("alert")).to_contain_text("six licensed feeds")
    button("View a fictional interface example").click()
    text("Interface example only · Not real news · No audio")
    button("What’s changed").click()
    button("Open fictional rehearsal").click()
    text("Fictional rehearsal · Not real news")
    heard = button("Mark as heard")
    expect(heard).to_be_enabled()
    assert page.evaluate("localStorage.length") == 0
    button("Listen to this edition").click()
    expect(page.get_by_role("status")).to_contain_text("ElevenLabs is not configured")
    assert page.locator("audio").count() == 0 and page.evaluate("localStorage.length") == 0
    heard.click()
    none = "Nothing new in this edition since your last listen."
    expect(page.get_by_role("status")).to_contain_text(none)
    later()
    delta = "New since your last listen"
    text(delta)
    expect(page.locator(".current .sentences")).not_to_contain_text("suspended freight crossings")
    expect(page.locator(".previous")).to_contain_text("suspended freight crossings")
    button("Listen to what's changed").click()
    expect(page.get_by_role("status")).to_contain_text("Audio unavailable")
    page.locator(".current summary").click()
    with context.expect_page() as new:
        page.locator(".current .source-list").get_by_role("link", name=re.compile("Reopening notice")).click()
    expect(new.value.locator("body")).to_contain_text("FICTIONAL SOURCE")
    new.value.close()
    # Same origin after reload still knows the earlier update. Neither loading nor TTS marked the new one.
    page.reload()
    button("What’s changed").click()
    button("Open fictional rehearsal").click()
    expect(page.get_by_role("status")).to_contain_text(none)
    later(); text(delta)
    heard.click(); expect(page.get_by_role("status")).to_contain_text(none)
    button("Dutch AI investor").click()
    later()
    text("Catch-up edition · 2 developments")
    button("Custom listener").click()
    page.get_by_label("Topics (comma-separated)").fill("rail, freight")
    button("Open fictional rehearsal").click()
    later(); text("Catch-up edition · 2 developments")
    first(); heard.click(); expect(page.get_by_role("status")).to_contain_text(none)
    page.get_by_label("Topics (comma-separated)").fill("insurance")
    later(); text("Catch-up edition · 2 developments")
    button("FX trader").click()
    later(); expect(page.get_by_role("status")).to_contain_text(none)
    button("Reset listening history").click()
    text("Catch-up edition · 2 developments")
    expect(page.locator(".previous")).to_have_count(0)
    for width in (375,768,1440):
        page.set_viewport_size({"width":width,"height":780})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert len(audio_jobs) == 2, audio_jobs  # Only the two explicit Listen clicks.
    assert not errors, errors
    print("PASS: daily failure, fictional example, dated rehearsal, explicit mark, no-key audio state, "
          "delta vs history, source click, reload, no-change, preset/wildcard isolation, reset, mobile width; "
          "no uncaught page errors. No MP3 played.")
    print("Chromium", browser.version)
    browser.close()
