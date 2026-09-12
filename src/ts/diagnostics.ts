/**
 * diagnostics.ts — parses MetaPost's Knuthian error format (docs/08 §3.1)
 * out of terminal or transcript output into structured diagnostics.
 *
 * What MetaPost prints (mp.w: `mp_print_err`, `mp_show_context`, `mp_error`,
 * `mp_warn`), verified against MetaPost 2.11:
 *
 *   >> x1                                  <- optional "diagnostic" values
 *   ! Undefined x coordinate has been replaced by 0.
 *   <to be read again>                     <- context: pairs of lines. The
 *                      ;                      first names the input level and
 *   --->{                                     shows the text read so far; the
 *        curl1}..{curl1}                      second is indented to the error
 *   l.4 draw z1--                             point and shows what follows.
 *                 z2;
 *   I need a `known' x value for this part of the path.   <- help, only in
 *   ...                                                      the transcript
 *                                          <- blank line ends the help
 *
 * With `file_line_error_style` the first line is `./job.mp:4: message`
 * instead. Fatal errors are `! Emergency stop.` whose help holds the
 * `*** (job aborted, ...)` reason. Warnings are `Warning: message`.
 *
 * The current file is tracked from MetaPost's `(path` / `)` open-file
 * tokens on ordinary output lines (an approximation, since user `message`
 * output can contain parentheses too).
 *
 * Dependency-free and browser-safe.
 */

export interface Diagnostic {
  severity: 'error' | 'warning';
  source: 'metapost' | 'tex' | 'bundle' | 'host';
  message: string;
  /** MetaPost's help paragraph, when present (transcript output has it). */
  help?: string[];
  file?: string;
  /** 1-based line from the `l.N` context line. */
  line?: number;
  /** 0-based column of the error point on that line, when it can be
   * recovered exactly (MetaPost truncates long context with `...`). */
  column?: number;
  /** For TeX errors: the btex block. */
  snippet?: string;
  /** The raw context lines MetaPost printed under the message, in order,
   * preceded by any `>> value` lines that introduced the error. */
  context?: string[];
}

/** `l.N text`, `<to be read again> `, `<*> name`, `macro->text`, ... */
function isContextFirstLine(line: string): boolean {
  if (line.startsWith('<') || /^l\.\d+ /.test(line)) return true;
  // macro expansion context: "name->..." or "--->..." for an unnamed one
  return /^[^\s].*->/.test(line);
}

/** The second line of a context pair is indented to the error column. */
function isContextSecondLine(line: string | undefined): boolean {
  return line !== undefined && (line === '' || line.startsWith(' '));
}

/** A line made only of MetaPost's progress tokens: `[N]` figures, `(path`
 * file opens and `)` closes — e.g. `[1] )`, `(./sub.mp`, ` [7])`. */
function isProgressLine(line: string): boolean {
  return /^(\s*(\[\d+\]|\)|\([^\s()]+))*\s*$/.test(line);
}

/** Output that can follow an error but is never part of its help text. */
function isNotHelp(line: string): boolean {
  return (
    line.startsWith('! ') ||
    line.startsWith('>> ') ||
    line.startsWith('Please type') ||
    line.startsWith('(see the transcript') ||
    line.startsWith('Transcript written') ||
    /^\d+ output files? written/.test(line) ||
    isProgressLine(line)
  );
}

/**
 * Update the open-file stack from a line of ordinary output: `(name` opens a
 * file (MetaPost prints the path it resolved), `)` closes the innermost.
 */
function trackFiles(line: string, stack: string[]): void {
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === '(') {
      let j = i + 1;
      while (j < line.length && !/[\s()]/.test(line[j])) j++;
      const name = line.slice(i + 1, j);
      if (name.length > 0 && (i === 0 || /[\s\])]/.test(line[i - 1]))) {
        stack.push(name);
        i = j;
        continue;
      }
    } else if (c === ')') {
      if (stack.length > 0) stack.pop();
    }
    i++;
  }
}

/**
 * Parse MetaPost terminal (or transcript) output into diagnostics, in the
 * order they were printed. Works on `term_out` (no help text) and on the
 * `.log` (with help text) alike.
 */
export function parseMetaPostLog(termOut: string): Diagnostic[] {
  const lines = termOut.split(/\r?\n/);
  const out: Diagnostic[] = [];
  const stack: string[] = [];
  let values: string[] = []; // pending ">> " lines
  let i = 0;

  const currentFile = (): string | undefined => (stack.length > 0 ? stack[stack.length - 1] : undefined);

  while (i < lines.length) {
    const line = lines[i];

    // ---- an error: "! message" or "file:N: message" ---------------------
    let message: string | undefined;
    let fileLine: { file: string; line: number } | undefined;
    const bang = /^! (.*)$/.exec(line);
    if (bang !== null) {
      message = bang[1];
    } else {
      const fl = /^([^\s:]+):(\d+): (.*)$/.exec(line);
      if (fl !== null) {
        fileLine = { file: fl[1], line: Number(fl[2]) };
        message = fl[3];
      }
    }
    if (message !== undefined) {
      const diag: Diagnostic = { severity: 'error', source: 'metapost', message };
      const file = fileLine?.file ?? currentFile();
      if (file !== undefined) diag.file = file;
      if (fileLine !== undefined) diag.line = fileLine.line;
      const context: string[] = values.length > 0 ? values : [];
      values = [];
      i++;
      // context pairs
      while (i < lines.length && isContextFirstLine(lines[i]) && isContextSecondLine(lines[i + 1])) {
        const first = lines[i];
        const second = lines[i + 1] ?? '';
        context.push(first, second);
        const lm = /^l\.(\d+) (.*)$/.exec(first);
        if (lm !== null) {
          diag.line = Number(lm[1]);
          const before = lm[2];
          if (before.startsWith('...')) delete diag.column; // truncated: exact column lost
          else diag.column = before.length;
        }
        i += 2;
      }
      // help paragraph, up to the blank line that ends it
      const help: string[] = [];
      while (i < lines.length && lines[i] !== '' && !isNotHelp(lines[i])) help.push(lines[i++]);
      if (i < lines.length && lines[i] === '') i++;
      if (context.length > 0) diag.context = context;
      if (help.length > 0) diag.help = help;
      out.push(diag);
      continue;
    }

    // ---- a warning: "Warning: message" -----------------------------------
    const warn = /^Warning: (.*)$/.exec(line);
    if (warn !== null) {
      const diag: Diagnostic = { severity: 'warning', source: 'metapost', message: warn[1] };
      const file = currentFile();
      if (file !== undefined) diag.file = file;
      out.push(diag);
      values = [];
      i++;
      continue;
    }

    // ---- a fatal reason printed on its own (mplib's term_out can do this) --
    if (line.startsWith('*** ')) {
      const diag: Diagnostic = { severity: 'error', source: 'metapost', message: line };
      const file = currentFile();
      if (file !== undefined) diag.file = file;
      out.push(diag);
      values = [];
      i++;
      continue;
    }

    // ---- ">> value" lines announce the next error ------------------------
    if (line.startsWith('>> ')) {
      values.push(line);
      i++;
      continue;
    }

    values = [];
    trackFiles(line, stack);
    i++;
  }
  return out;
}
