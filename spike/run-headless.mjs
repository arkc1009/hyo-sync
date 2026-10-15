// 헤드리스 Chromium으로 spike/pitch.html을 돌려 testdata/*.wav 를 분석하고 정답과 비교한다.
// node run-headless.mjs [case ...]   (기본: clean low noisy long)
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const DIR = import.meta.dirname;
const DATA = join(DIR, 'testdata');
const RESULTS = join(DIR, 'results');
// node run-headless.mjs [--backend=webgl|wasm|cpu] [--no-crepe] [--no-pitchy] [case ...]
const argv = process.argv.slice(2);
const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const backend = flag('backend');
const opts = { crepe: !argv.includes('--no-crepe'), pitchyOn: !argv.includes('--no-pitchy') };
const positional = argv.filter((a) => !a.startsWith('--'));
const cases = positional.length ? positional : ['clean', 'low', 'noisy', 'long'];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const p = join(DIR, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(DIR) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  // COOP/COEP: tfjs wasm 스레드 백엔드(SharedArrayBuffer)용. Vercel에서는 next.config headers로 같은 걸 건다
  res.writeHead(200, {
    'content-type': MIME[extname(p)] ?? 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(`${base}/pitch.html${backend ? `?backend=${backend}` : ''}`);
await page.evaluate(() => window.__spike.ready);
console.log('backend:', await page.evaluate(() => tf.getBackend()), 'opts:', opts);

mkdirSync(RESULTS, { recursive: true });
const rows = [];
for (const name of cases) {
  const wav = join(DATA, `${name}.wav`);
  const truthPath = join(DATA, `${name}.truth.json`);
  const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, 'utf8')) : null;
  await page.setInputFiles('#file', wav);
  const t0 = Date.now();
  const r = await page.evaluate(
    ({ truth, opts }) => window.__spike.analyze(document.getElementById('file').files[0], { truth, ...opts }),
    { truth, opts },
  );
  const wall = Date.now() - t0;
  writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify(r));
  for (const [method, m] of Object.entries(r.methods)) {
    const voiced = m.track.f0Cents.filter((c) => c != null).length / m.track.frames;
    rows.push({
      case: name, method, backend: r.backend, durationS: +r.durationS.toFixed(1), decodeMs: Math.round(r.decodeMs),
      ms: Math.round(m.ms), xRealtime: +((r.durationS * 1000) / m.ms).toFixed(1), voicedPct: +(voiced * 100).toFixed(1),
      ...(m.score
        ? { rpa: +(m.score.rpa * 100).toFixed(1), octaveErrPct: +(m.score.octaveErr * 100).toFixed(2),
            voicingRecall: +(m.score.voicingRecall * 100).toFixed(1), falseVoicingPct: +(m.score.falseVoicing * 100).toFixed(1),
            medAbsErrCents: m.score.medianAbsErr }
        : {}),
    });
  }
  console.log(`${name}: wall ${wall}ms`);
}
console.table(rows);
writeFileSync(join(RESULTS, 'summary.json'), JSON.stringify(rows, null, 2));
await browser.close();
server.close();
