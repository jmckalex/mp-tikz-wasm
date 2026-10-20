// What a document cannot do: run commands, or reach files outside the engines' in-memory tree.
// Run in Node on purpose: there Emscripten's system() would really spawn a process
// (child_process), where in a browser it fails with ENOSYS, so this is the harder case.
// Every attempt names a marker file on the host; none may appear. Run after `npm run build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(new URL('../..', import.meta.url).pathname);
const built = fs.existsSync(path.join(REPO, 'dist/index.js')) && fs.existsSync(path.join(REPO, 'dist/tex.wasm')) && fs.existsSync(path.join(REPO, 'dist/luatex.wasm'));

describe.skipIf(!built)('sandbox', () => {
  let mp: any;
  let dir: string;
  let secret: string;
  const marker = (n: string) => path.join(dir, `marker-${n}`);
  const markers = () => fs.readdirSync(dir).filter((f) => f.startsWith('marker-'));
  // a probe's value runs to the end of its line, or to the ';' the Lua probes end with: TeX may put the
  // page marker (" [1") on the same line, depending on what the LaTeX kernel printed before shipout
  const probes = (log: string) => Object.fromEntries([...log.matchAll(/^PROBE ([^=]+)=([^;\n]*)/gm)].map((m) => [m[1], m[2]]));
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpw-sandbox-'));
    secret = path.join(dir, 'secret.txt');
    fs.writeFileSync(secret, 'HOST-SECRET\n');
    const { MetaPost, DEFAULT_BUNDLES } = await import(path.join(REPO, 'dist/index.js'));
    mp = await MetaPost.create({ logLevel: 'silent', bundles: [...DEFAULT_BUNDLES, 'opentype'] });
  }, 60_000);
  afterAll(() => { mp?.dispose(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('pdfTeX: no \\write18, no host files read or written, whatever the first line asks', async () => {
    const r = await mp.latex(`%&latex -shell-escape
\\documentclass{article}\\begin{document}
\\immediate\\write18{touch ${marker('w18')}}\\write18{touch ${marker('w18-shipout')}}
\\typeout{PROBE shellescape=\\the\\pdfshellescape}
\\newread\\r \\openin\\r=${secret} \\ifeof\\r\\typeout{PROBE openin=closed}\\else\\typeout{PROBE openin=open}\\fi
\\openin\\r=../../../../../../../../..${secret} \\ifeof\\r\\typeout{PROBE openin-dotdot=closed}\\else\\typeout{PROBE openin-dotdot=open}\\fi
\\IfFileExists{/etc/hosts}{\\typeout{PROBE etc-hosts=yes}}{\\typeout{PROBE etc-hosts=no}}
\\immediate\\openout5=${marker('openout')} \\immediate\\write5{x}\\immediate\\closeout5
x\\end{document}`, { output: 'pdf' });
    const p = probes(r.texLog);
    expect(p).toMatchObject({ shellescape: '0', openin: 'closed', 'openin-dotdot': 'closed', 'etc-hosts': 'no' });
    expect(r.texLog).toMatch(/runsystem\(touch [^)]*\)\.\.\.disabled/);
    expect(markers()).toEqual([]);
  }, 60_000);

  it('LuaTeX: no command execution, no sockets, no native libraries, no host files', async () => {
    const r = await mp.latex(String.raw`\documentclass{article}\begin{document}\directlua{
local function t(name, f) local ok, a = pcall(f); texio.write_nl('PROBE ' .. name .. '=' .. (ok and tostring(a) or 'error') .. ';') end
t('shell_escape', function() return status.shell_escape end)
t('os.execute', function() return os.execute('touch ${marker('execute')}') end)
t('setenv-then-execute', function() os.setenv('shell_escape', 't'); texconfig.shell_escape = 't'; return os.execute('touch ${marker('setenv')}') end)
t('io.popen', function() return io.popen('touch ${marker('popen')}') end)
t('os.exec', function() return os.exec and os.exec({'touch', '${marker('exec')}'}) end)
t('os.spawn', function() return os.spawn and os.spawn({'touch', '${marker('spawn')}'}) end)
t('os.kpsepopen', function() return os.kpsepopen and os.kpsepopen('touch ${marker('kpsepopen')}', 'r') end)
t('socket', function() return require('socket') end)
t('ffi', function() return ffi end)
t('loadlib', function() return package.loadlib('/usr/lib/libc.so', 'system') end)
t('io.open-read', function() local f = io.open('${secret}'); return f and f:read('*l') end)
t('io.open-write', function() local acc = ''; for part in ('${dir}'):gmatch('[^/]+') do acc = acc .. '/' .. part; lfs.mkdir(acc) end; return io.open('${marker('ioopen')}', 'w') end)
t('root', function() local n = {}; for e in lfs.dir('/') do if e ~= '.' and e ~= '..' then table.insert(n, e) end end; table.sort(n); return table.concat(n, ' ') end)
}x\end{document}`, { engine: 'lualatex', output: 'pdf' });
    expect(r.status).toBe('ok');
    const p = probes(r.texLog);
    expect(p).toMatchObject({
      shell_escape: '0', 'os.execute': 'nil', 'setenv-then-execute': 'nil', 'io.popen': 'nil', 'os.exec': 'nil', 'os.spawn': 'nil',
      'os.kpsepopen': 'nil', socket: 'error', ffi: 'nil', loadlib: 'nil', 'io.open-read': 'nil', 'io.open-write': 'nil',
    });
    // the whole tree a document sees: Emscripten's own /dev, /proc, /tmp, /home, and what the host put there
    expect(p.root).toBe('bin dev home proc texmf texmf-var tmp work');
    expect(markers()).toEqual([]);
  }, 60_000);

  it('MetaPost: no runscript unless the host supplies one, no host files', async () => {
    const r = await mp.run(`message "PROBE runscript=" & runscript("touch ${marker('runscript')}"); write "x" to "${marker('write')}"; string s; s := readfrom "${secret}"; message "PROBE readfrom=" & s; end.`);
    expect(r.log).not.toContain('HOST-SECRET');
    expect(markers()).toEqual([]);
  });
});
