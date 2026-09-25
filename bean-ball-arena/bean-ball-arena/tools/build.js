/* Build: copies client + shared into dist/ with flat paths.
 *   dist/index.html     full page for any static host (GitHub Pages, Cloudflare Pages)
 *   dist/artifact.html  body-only variant for the claude.ai artifact wrapper
 * node tools/build.js
 */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..'), out = path.join(root, 'dist');
function rm(p) { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); }
function cp(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
rm(out); fs.mkdirSync(out, { recursive: true });
fs.readdirSync(path.join(root, 'shared')).forEach(function (f) { if (/\.js$/.test(f)) cp(path.join(root, 'shared', f), path.join(out, 'shared', f)); });
fs.readdirSync(path.join(root, 'client', 'js')).forEach(function (f) { if (/\.js$/.test(f)) cp(path.join(root, 'client', 'js', f), path.join(out, 'js', f)); });
cp(path.join(root, 'client', 'styles.css'), path.join(out, 'styles.css'));
var html = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8').replace(/\.\.\/shared\//g, 'shared/');
fs.writeFileSync(path.join(out, 'index.html'), html);
// artifact variant: strip doctype/html/head/body wrappers (the host adds its own skeleton)
var title = (html.match(/<title>[\s\S]*?<\/title>/) || [''])[0];
var links = (html.match(/<link[^>]*>/g) || []).join('\n');
var body = html.split(/<body[^>]*>/)[1].split('</body>')[0];
var art = title + '\n' + links + '\n<script>document.body.classList.add("in-menu");</script>\n' + body;
fs.writeFileSync(path.join(out, 'artifact.html'), art);
console.log('built', fs.readdirSync(out).join(', '));
