// Genera páginas estáticas ligeras (sin JS) para los QR: dist/p/<slug>/<persona>/index.html
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
if (!existsSync(dist)) throw new Error('Ejecuta primero vite build');

const team = JSON.parse(readFileSync(join(root, 'content/team.json'), 'utf8'));
const projects = readdirSync(join(root, 'content/projects'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(root, 'content/projects', f), 'utf8')));

const isSet = (v) => typeof v === 'string' && v.trim() !== '' && v.trim().toUpperCase() !== 'TODO';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const src = (p) => (p.startsWith('http') || p.startsWith('/') ? p : `/${p}`);

const CSS = `*{box-sizing:border-box}body{margin:0;background:#f4f4f6;color:#1a1a1a;font:17px/1.65 -apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif;-webkit-text-size-adjust:100%}
header{display:flex;align-items:center;gap:12px;padding:16px 20px;background:#fff;border-bottom:1px solid #eee}
.seal{width:40px;height:40px;border-radius:9px;background:#C2302A;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700}
header b{display:block;font-size:17px}header span{font-size:13px;color:#888}
main{max-width:640px;margin:0 auto;padding:20px}
h1{font-size:26px;line-height:1.3;margin:4px 0 12px}
h2{font-size:17px;color:#C2302A;margin:24px 0 6px}
.lead{font-size:18px;margin:0 0 8px}
ul{margin:0;padding-left:22px}li{margin:4px 0}
.ph img{display:block;width:100%;border-radius:12px;margin:12px 0;background:#e9e9ec}
.card{background:#fff;border-radius:16px;padding:20px;margin:28px 0 12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.card h2{margin-top:0}.n{font-size:22px;font-weight:700}.co{color:#888;margin-bottom:12px}
.r{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid #f0f0f0;word-break:break-all}
.r span{color:#888;flex:none}a{color:#C2302A;text-decoration:none}
.qr{text-align:center;margin:12px 0 4px}.qr img{width:200px;height:200px}.qr div{font-size:14px;color:#888}
footer{text-align:center;color:#aaa;font-size:13px;padding:8px 0 32px}`;

function list(title, items) {
  const xs = (items ?? []).filter(isSet);
  return xs.length ? `<h2>${esc(title)}</h2><ul>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
}

function contactCard(m) {
  if (!m) return '';
  const rows = [];
  if (isSet(m.wechat)) rows.push(`<div class="r"><span>微信 WeChat</span><b>${esc(m.wechat)}</b></div>`);
  if (isSet(m.whatsapp)) rows.push(`<div class="r"><span>WhatsApp</span><a href="https://wa.me/${esc(m.whatsapp.replace(/\D/g, ''))}">${esc(m.whatsapp)}</a></div>`);
  if (isSet(m.email)) rows.push(`<div class="r"><span>邮箱 Email</span><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>`);
  rows.push(`<div class="r"><span>网站 Web</span><a href="https://traevo.net">traevo.net</a></div>`);
  const qr = isSet(m.wechatQr) ? `<div class="qr"><img src="${esc(src(m.wechatQr))}" alt="WeChat QR"><div>扫码添加微信</div></div>` : '';
  return `<section class="card"><h2>联系我们</h2><div class="n">${esc(m.name)}</div><div class="co">Traevo Global</div>${qr}${rows.join('')}</section>`;
}

function page(p, member) {
  const zh = p.zh ?? {};
  const title = isSet(zh.title) ? zh.title : p.name;
  const photos = (p.photos ?? []).filter(isSet).map((x) => `<img src="${esc(src(x))}" alt="" loading="lazy">`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Traevo Global</title><style>${CSS}</style></head><body>
<header><div class="seal">采</div><div><b>Traevo Global</b><span>西班牙 · 中国 采购服务</span></div></header>
<main><h1>${esc(title)}</h1>${isSet(zh.summary) ? `<p class="lead">${esc(zh.summary)}</p>` : ''}
${list('我们的需求', zh.needs)}${list('要求', zh.requirements)}${list('我们想了解', zh.questions)}
${photos ? `<div class="ph">${photos}</div>` : ''}
${contactCard(member)}</main><footer>Traevo Global · traevo.net</footer></body></html>`;
}

let n = 0;
for (const p of projects) {
  const dir = join(dist, 'p', p.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(p, null));
  for (const m of team) {
    mkdirSync(join(dir, m.slug), { recursive: true });
    writeFileSync(join(dir, m.slug, 'index.html'), page(p, m));
    n++;
  }
}
console.log(`Páginas públicas: ${n} en dist/p/`);
