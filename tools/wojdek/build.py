# Składa stronę karykatur: JS (esbuild) + zasób postaci w base64 + szablon HTML.
import subprocess, base64, os, re, sys
G = '/home/claude/game'; OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/tomi-aludec/wojdek.html'
subprocess.run(['npx', 'esbuild', 'tools/wojdek/main.ts', '--bundle', '--minify', '--format=iife', '--outfile=/tmp/wojdek.js', '--log-level=warning'], cwd=G, check=True)
js = open('/tmp/wojdek.js').read()
tpl = open(os.path.join(G, 'tools/wojdek/template.html')).read()
data = 'const HUMAN_JSON=' + open(os.path.join(G, 'public/assets/human/human.json')).read() + ';const HUMAN_BIN="' + base64.b64encode(open(os.path.join(G, 'public/assets/human/human.bin'), 'rb').read()).decode() + '";'
html = tpl.replace('/*DATA*/', data).replace('/*APP*/', js.replace('</script', '<\\/script'))
open(OUT, 'w').write(html); print('ok', len(html) // 1024, 'KB')
