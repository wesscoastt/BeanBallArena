"""Two real browser clients against a local server: create, join by link, start, move.
python3 tests/browser_online.py <three.min.js> <outdir> [base]"""
import sys, time, json
from playwright.sync_api import sync_playwright
three_src = open(sys.argv[1], 'rb').read(); OUT = sys.argv[2]
BASE = sys.argv[3] if len(sys.argv) > 3 else 'http://localhost:3100/'
def setup(b, vp, tag):
    ctx = b.new_context(viewport=vp)
    ctx.add_init_script("try{localStorage.setItem('bba_settings_v1', JSON.stringify({shadows:false, renderScale:0.5, name:'%s'}))}catch(e){}" % tag)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    pg.route('**/three.min.js', lambda r: r.fulfill(status=200, body=three_src, content_type='application/javascript'))
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    return pg, errs
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    A, ea = setup(b, {'width': 800, 'height': 450}, 'Wes')
    B, eb = setup(b, {'width': 800, 'height': 450}, 'Friend')
    A.goto(BASE); time.sleep(3)
    print('available', A.evaluate("BBA.Net.available"))
    A.evaluate("BBA.UI.action('create')"); time.sleep(1.5)
    code = A.evaluate("BBA.Net.code"); print('code', code)
    A.screenshot(path=OUT + '/on_lobbyA.png')
    B.goto(BASE + '?room=' + code + '&lag=120'); time.sleep(4)
    B.screenshot(path=OUT + '/on_lobbyB.png')
    print('B screen', B.evaluate("BBA.UI.current"), 'lobby humans', A.evaluate("BBA.Net.lobby && BBA.Net.lobby.humans"))
    B.evaluate("BBA.Lobby.action('lobby-ready')"); time.sleep(0.6)
    A.evaluate("BBA.Lobby.action('lobby-start')"); time.sleep(3)
    print('modes', A.evaluate("BBA.Game.mode"), B.evaluate("BBA.Game.mode"), 'ids', A.evaluate("BBA.Game.localId"), B.evaluate("BBA.Game.localId"))
    time.sleep(3)
    # B moves forward with keyboard (prediction)
    B.keyboard.down('KeyW'); B.keyboard.down('ShiftLeft'); time.sleep(4); B.keyboard.up('KeyW'); B.keyboard.up('ShiftLeft')
    time.sleep(1)
    bid = B.evaluate("BBA.Game.localId")
    selfB = B.evaluate("(function(){var p=BBA.Game.sim.players[BBA.Game.localId];return [p.x,p.y,p.z]})()")
    seenA = A.evaluate("(function(i){var p=BBA.Game.sim.players[i];return [p.x,p.y,p.z]})(%d)" % bid)
    print('B self', selfB, 'A sees B', seenA, 'pending', B.evaluate("BBA.Game.net.pending.length"), 'corr', B.evaluate("JSON.stringify(BBA.Game.net.corr)"))
    A.screenshot(path=OUT + '/on_matchA.png'); B.screenshot(path=OUT + '/on_matchB.png')
    print('score', A.evaluate("BBA.Game.sim.match.score"), 'clock', A.evaluate("BBA.Game.sim.match.clock"))
    print('errors A', ea[:8]); print('errors B', eb[:8])
    b.close()
