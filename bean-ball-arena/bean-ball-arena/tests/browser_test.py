"""Headless browser smoke test for Bean Ball Arena.
Usage: python3 tests/browser_test.py <three.min.js path> <out dir> [base url]
"""
import sys, time, json, os
from playwright.sync_api import sync_playwright

THREE = sys.argv[1]
OUT = sys.argv[2]
BASE = sys.argv[3] if len(sys.argv) > 3 else 'http://127.0.0.1:8765/client/index.html'
os.makedirs(OUT, exist_ok=True)
three_src = open(THREE, 'rb').read()

def run(viewport, tag, touch=False):
    errs = []
    info = {}
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(viewport=viewport, has_touch=touch, is_mobile=touch,
                            user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' if touch else None))
        ctx.add_init_script("try{localStorage.setItem('bba_settings_v1', JSON.stringify({shadows:false, renderScale:0.5, antialias:false}))}catch(e){}")
        pg = ctx.new_page()
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        pg.route('**/three.min.js', lambda r: r.fulfill(status=200, body=three_src, content_type='application/javascript'))
        pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        pg.goto(BASE)
        time.sleep(4)
        pg.screenshot(path=f'{OUT}/{tag}_1_menu.png')
        info['draw'] = pg.evaluate("(function(){var r=BBA.Game.renderer.info.render;return {calls:r.calls,tris:r.triangles,merged:BBA.Game.arena.mergedCount}})()")
        # quick play
        pg.evaluate("BBA.UI.action('quick')")
        time.sleep(1.5)
        pg.screenshot(path=f'{OUT}/{tag}_2_countdown.png')
        time.sleep(3)
        # walk off the deck toward the court
        if not touch:
            pg.keyboard.down('KeyW'); pg.keyboard.down('ShiftLeft')
            time.sleep(2.5)
            pg.screenshot(path=f'{OUT}/{tag}_3_running.png')
            pg.keyboard.press('Space'); time.sleep(0.6)
            pg.keyboard.up('ShiftLeft'); pg.keyboard.up('KeyW')
        else:
            time.sleep(2)
            pg.screenshot(path=f'{OUT}/{tag}_3_running.png')
        info['after_drop'] = pg.evaluate("(function(){var p=BBA.Game.sim.players[0];return {x:p.x,y:p.y,z:p.z,phase:BBA.Game.sim.match.phase,clock:BBA.Game.sim.match.clock,score:BBA.Game.sim.match.score}})()")
        # let bots play a while, fast-forward: temporarily run extra steps
        time.sleep(6)
        pg.screenshot(path=f'{OUT}/{tag}_4_play.png')
        # give the local player the ball and charge a shot for arc screenshot
        pg.evaluate("(function(){var s=BBA.Game.sim;var p=s.players[0];p.x=0;p.z=12;p.y=0;s.giveBall(0);BBA.Game.rig.yaw=0;})()")
        if not touch:
            pg.keyboard.down('KeyR'); time.sleep(0.55)
            pg.screenshot(path=f'{OUT}/{tag}_5_charging.png')
            pg.keyboard.up('KeyR'); time.sleep(0.8)
            pg.screenshot(path=f'{OUT}/{tag}_6_shot.png')
        info['after_shot'] = pg.evaluate("(function(){var s=BBA.Game.sim;return {ball:s.ball.state, score:s.match.score, phase:s.match.phase}})()")
        # dunk attempt near hoop
        pg.evaluate("(function(){var s=BBA.Game.sim;var p=s.players[0];p.x=0;p.z=22.6;p.y=0;p.vx=0;p.vz=5;p.yaw=0;s.giveBall(0);BBA.Game.rig.yaw=0;})()")
        if not touch:
            pg.keyboard.down('KeyW'); pg.keyboard.press('Space'); time.sleep(0.2)
            pg.keyboard.press('KeyR'); time.sleep(0.25)
            pg.screenshot(path=f'{OUT}/{tag}_7_dunk.png')
            pg.keyboard.up('KeyW'); time.sleep(1)
        info['after_dunk'] = pg.evaluate("(function(){var s=BBA.Game.sim;return {score:s.match.score, phase:s.match.phase, dunks:s.players[0].stats.dunks}})()")
        # pause menu
        pg.evaluate("BBA.Game.pause(true)")
        time.sleep(0.5)
        pg.screenshot(path=f'{OUT}/{tag}_8_pause.png')
        # fast-forward to end: set clock low
        pg.evaluate("BBA.Game.pause(false); BBA.Game.sim.match.clock=3; BBA.Game.sim.match.score=[BBA.Game.sim.match.score[0]+1,BBA.Game.sim.match.score[1]]")
        time.sleep(9)
        pg.screenshot(path=f'{OUT}/{tag}_9_results.png')
        info['end'] = pg.evaluate("(function(){var s=BBA.Game.sim;return {phase:s.match.phase,winner:s.match.winner,ui:BBA.UI.current}})()")
        pg.evaluate("BBA.UI.action('quit')"); time.sleep(1)
        pg.evaluate("BBA.UI.show('customize')"); time.sleep(1.2)
        pg.screenshot(path=f'{OUT}/{tag}_10_customize.png')
        pg.evaluate("BBA.UI.show('settings')"); time.sleep(0.6)
        pg.screenshot(path=f'{OUT}/{tag}_11_settings.png')
        pg.evaluate("BBA.UI.setTab='controls'; BBA.UI.buildSettings()"); time.sleep(0.4)
        pg.screenshot(path=f'{OUT}/{tag}_12_controls.png')
        pg.evaluate("BBA.UI.show('setup')"); time.sleep(0.5)
        pg.screenshot(path=f'{OUT}/{tag}_13_setup.png')
        pg.evaluate("BBA.UI.action('tutorial')"); time.sleep(2)
        pg.screenshot(path=f'{OUT}/{tag}_14_tutorial.png')
        info['fps'] = pg.evaluate("(function(){return new Promise(function(res){var n=0,t0=performance.now();function f(){n++; if(performance.now()-t0<2000) requestAnimationFrame(f); else res(n/2);} requestAnimationFrame(f);});})()")
        b.close()
    return info, errs

for vp, tag, touch in [({'width': 960, 'height': 540}, 'desk', False), ({'width': 844, 'height': 390}, 'phone', True)]:
    info, errs = run(vp, tag, touch)
    print(tag, json.dumps(info))
    print(tag, 'ERRORS:', json.dumps(errs[:30], indent=1))
