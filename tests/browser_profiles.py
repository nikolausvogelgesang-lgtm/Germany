"""Chromium, fictional feeds, real UI, local eSpeak. Optional existing tools:
Python Playwright, Chromium, espeak, ffmpeg. Stop your real backend. Run Vite
on 127.0.0.1:5173, then this script. It starts its OWN isolated mock backend
on 3001; if that port is taken the test stops before any browser POST."""
import os, re, subprocess
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
def exercise(page, native_refresh=True):
    btn=lambda n:page.get_by_role('button',name=n,exact=True)
    audio=page.locator('audio')
    jobs=[]; voice_jobs=[]
    def count(r):
        if r.method=='POST' and r.url.endswith('/api/briefings'):jobs.append(r.post_data_json)
        if r.method=='POST' and r.url.endswith('/api/memory') and r.post_data_json.get('withAudio'):voice_jobs.append(r.url)
    page.on('request',count)
    def viewport(width):
        page.set_viewport_size({'width':width,'height':850})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
    def play(url=None,daily=False):
        expect(audio).to_be_visible()
        page.wait_for_function('document.querySelector("audio")?.readyState>=1')
        duration=audio.evaluate('a=>a.duration')
        if daily: assert 60<=duration<=180,duration
        else: assert 0<duration<60,duration
        if url:assert urlparse(audio.evaluate('a=>a.currentSrc')).path==url
        audio.evaluate('a=>a.play()')
        page.wait_for_function('document.querySelector("audio").currentTime>.15')
        audio.evaluate('a=>{a.currentTime=a.duration*.7}')
        page.wait_for_function('(()=>{const a=document.querySelector("audio");return !a.seeking && a.currentTime>=a.duration*.7})()')
        audio.evaluate('a=>a.pause()')
        return duration
    def generate(lang,events,keyboard=False):
        # Observe the actual committed pending state; a fast local response
        # can replace its button before a Python-side locator samples it.
        page.evaluate('''() => {
          window.qaSawPending=false;
          const ob=new MutationObserver(()=>{
            if([...document.querySelectorAll('button:disabled')].some(b=>b.textContent.includes('Generating…'))){
              window.qaSawPending=true;ob.disconnect()
            }
          });ob.observe(document.querySelector('main'),{subtree:true,attributes:true,childList:true,characterData:true})
        }''')
        with page.expect_response(lambda r:r.url.endswith('/api/briefings') and r.request.method=='POST') as response:
            trigger=btn('Generate briefing')
            if keyboard:
                trigger.focus();page.keyboard.press('Enter')
            else:
                trigger.evaluate('b=>{b.click();b.click()}')  # same-tick duplicate
        assert page.evaluate('window.qaSawPending')
        r=response.value.json()
        assert r['editionStatus']=='complete' and r['diagnostics']['finalVerifiedWords']>=140
        assert set(s['storyId'] for s in r['segments'][1:])==events
        expect(audio).to_be_visible()
        assert page.locator('.spoken').all_text_contents()==[s['text'] for s in r['segments']]
        links=page.locator('.script-text .citation')
        assert links.count()==len(r['segments'])-1
        for i,s in enumerate(r['segments'][1:]):
            src=s['sources'][0]
            assert src['articleId'] in events and links.nth(i).get_attribute('href')==src['url']
        expect(page.locator('.script-text').first).to_have_attribute('lang',lang)
        print(lang,r['diagnostics']['finalVerifiedWords'],'verified fixture words,',
              round(play(r['audioUrl'],True),3),'s browser metadata; native play/pause/seek')
        return r

    viewport(1440)
    expect(btn('FX trader')).to_have_attribute('aria-pressed','true')
    fx=generate('en',{'cairn','fen'},True)
    btn('Dutch AI investor').click()
    viewport(768); generate('nl',{'wilg','riet'})
    btn('Custom listener').click()
    expect(btn('Generate briefing')).to_be_disabled()
    page.get_by_label('Topics (comma-separated)').fill('Energie, Öl')
    page.get_by_label('Language',exact=True).select_option('de')
    mins=page.get_by_label('Maximum minutes');mins.fill('0');expect(btn('Generate briefing')).to_be_disabled();mins.fill('3')
    viewport(375);de=generate('de',{'auen','erlental'})
    viewport(375)
    assert len(jobs)==3 and all(j['asOf']=='2026-11-19T23:59:59Z' and j['listener']['maxMinutes']==3 for j in jobs)
    assert jobs[2]['listener']==dict(language='de',topics=['Energie','Öl'],depth='brief',maxMinutes=3)
    btn('Dutch AI investor').click()
    # Same URI, now unavailable: only retry playback; no model/TTS POST.
    pattern='**'+fx['audioUrl']
    def missing(route):route.fulfill(status=404,headers={'cache-control':'no-store'},body='')
    page.route(pattern,missing)
    btn('FX trader').click()
    expect(page.get_by_text('Playback failed.',exact=True)).to_be_visible()
    expect(page.locator('.spoken').first).to_have_text(fx['segments'][0]['text'])
    page.unroute(pattern,missing)
    btn('Retry playback').click();play(fx['audioUrl'],True)
    btn('Custom listener').click()
    expect(audio).to_be_visible()
    assert urlparse(audio.get_attribute('src')).path==de['audioUrl'] and len(jobs)==3
    btn('FX trader').click();btn('What’s changed').click();btn('Open fictional rehearsal').click()
    first=lambda:page.get_by_role('button',name=re.compile('FIRST EDITION')).click()
    later=lambda:page.get_by_role('button',name=re.compile('NEXT EDITION')).click()
    hear=btn('Mark as heard')
    btn('Listen to this edition').click();play()
    assert page.evaluate('localStorage.length')==0
    hear.click();expect(page.get_by_text('All caught up',exact=True)).to_be_visible()
    later()
    expect(page.get_by_text('New since your last listen',exact=True)).to_be_visible()
    expect(page.locator('.current .spoken').last).not_to_contain_text('suspended freight crossings')
    expect(page.locator('.previous')).to_contain_text('suspended freight crossings')
    btn("Listen to what's changed").click();play()
    hear.click();expect(page.get_by_text('All caught up',exact=True)).to_be_visible()
    expect(audio).to_have_count(0)
    btn('Dutch AI investor').click();later()
    expect(page.get_by_text('Catch-up edition · 2 developments',exact=True)).to_be_visible()
    btn('FX trader').click();later();expect(page.get_by_text('All caught up',exact=True)).to_be_visible()
    if native_refresh:
        page.reload();btn('What’s changed').click();btn('Open fictional rehearsal').click();later()
        expect(page.get_by_text('All caught up',exact=True)).to_be_visible()
    btn('Reset listening history').click();first();expect(hear).to_be_enabled()
    for width in (375,768,1440):viewport(width)
    assert len(voice_jobs)==2 and len(jobs)==3
    btn('Today’s briefing').click();btn('Custom listener').click()
    page.get_by_label('Topics (comma-separated)').fill('lunar railways')
    page.locator('.window-control select').select_option('')
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/api/briefings')) as miss:
        btn('Generate briefing').click()
    assert miss.value.status==400 and 'asOf' not in jobs[-1]
    expect(page.get_by_role('alert')).to_contain_text('No eligible')
    expect(audio).to_have_count(0)
    print('Current window: no archive cutoff sent; unrelated topic stayed empty.')
    print('Memory: two explicit voice jobs; separate profile, acknowledgement, continuation, caught-up silence and reset.',
          'Real reload passed.' if native_refresh else 'Reload not exercised in this rendering harness.')

if __name__=='__main__':
    proc=subprocess.Popen(['node','tests/fixture-listening-desk.mjs'],cwd=ROOT,stdout=subprocess.PIPE,text=True)
    try:
        assert '127.0.0.1:3001 (8 private articles)' in proc.stdout.readline(),'Fixture server not available. Stop real backend; do not test it.'
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_BIN','/usr/bin/chromium'),args=['--disable-background-networking'])
            page=browser.new_page()
            page.context.route('**/*',lambda r:r.continue_() if urlparse(r.request.url).netloc=='127.0.0.1:5173' else r.abort())
            page.goto('http://127.0.0.1:5173'); errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            exercise(page);assert not errors,errors
            print('PASS fictional browser integration',browser.version)
            browser.close()
    finally:
        proc.terminate();proc.wait(timeout=5)
