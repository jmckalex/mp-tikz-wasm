/**
 * mpx.ts — splits a `.mpx` file (dvitomp output) into one MetaPost primary
 * per typeset block (docs/05 §4.1).
 *
 * The format, as written by `mpx_run_dvitomp`:
 *
 *   % Written by metapost version 2.11        <- banner
 *   begingroup save _p,_r,_s,_n; ...          <- chunk 0
 *   _p endgroup
 *   mpxbreak
 *   begingroup ...                            <- chunk 1
 *   _p endgroup
 *   mpxbreak
 *
 * Chunk k corresponds to btex block k; each chunk is self-contained and is a
 * valid MetaPost primary, so it can be returned from `make_text` verbatim.
 */

/**
 * Drop the leading `%` banner, split on lines equal to `mpxbreak`, and return
 * the chunks. Leading and trailing empty lines of a chunk are removed (so a
 * chunk ends with `_p endgroup`, not a newline); a trailing chunk that is
 * empty or whitespace-only — the normal remainder after the final `mpxbreak`
 * — is ignored. CRLF line ends are accepted.
 */
export function splitMpx(mpx: string): string[] {
  const lines = mpx.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // trailing newline
  if (lines.length > 0 && lines[0].startsWith('%')) lines.shift(); // banner

  const chunks: string[] = [];
  let cur: string[] = [];
  const flush = (last: boolean): void => {
    while (cur.length > 0 && cur[0] === '') cur.shift();
    while (cur.length > 0 && cur[cur.length - 1] === '') cur.pop();
    if (last && cur.every((l) => l.trim() === '')) {
      cur = [];
      return;
    }
    chunks.push(cur.join('\n'));
    cur = [];
  };
  for (const line of lines) {
    if (line === 'mpxbreak') flush(false);
    else cur.push(line);
  }
  flush(true);
  return chunks;
}
