import { describe, it, expect } from 'vitest';
import { parseBibtexLog, parseMakeindexLog } from '../../src/ts/texutils.js';

// transcripts as BibTeX 0.99d and makeindex 2.17 (TeX Live 2025) write them
const BLG = `This is BibTeX, Version 0.99d (TeX Live 2025)
Capacity: max_strings=200000, hash_size=200000, hash_prime=170003
The top-level auxiliary file: doc.aux
I couldn't open database file nosuchdb.bib
---line 6 of file doc.aux
 : \\bibdata{nosuchdb
 :                  }
I'm skipping whatever remains of this command
The style file: plain.bst
Database file #1: refs.bib
Repeated entry---line 1 of file errs.bib
 : @article{skyrms1990
 :                    ,
I'm skipping whatever remains of this entry
A bad cross reference---entry "badxref"
refers to entry "nosuchproc", which doesn't exist
Warning--I didn't find a database entry for "nokey"
Warning--string name "jphl" is undefined
--line 12 of file refs.bib
Warning--empty year in broken
I found no style file---while reading file doc.aux
(There were 4 error messages)
`;

const ILG = `This is makeindex, version 2.17 [TeX Live 2025] (kpathsea + Thai support).
Scanning input file doc.idx....
!! Input index error (file = doc.idx, line = 40):
   -- Missing arguments -- need two (premature LFD).
done (41 entries accepted, 1 rejected).
Sorting entries....done (217 comparisons).
Generating output file doc.ind....
## Warning (input = doc.idx, line = 39; output = doc.ind, line = 54):
   -- Unmatched range closing operator ).
done (66 lines written, 1 warning).
Output written in doc.ind.
Transcript written in doc.ilg.
`;

describe('BibTeX transcript', () => {
  it('finds errors with their file and line, and warnings', () => {
    const d = parseBibtexLog(BLG);
    expect(d.filter((x) => x.severity === 'error')).toEqual([
      { severity: 'error', source: 'bibtex', message: "I couldn't open database file nosuchdb.bib", line: 6, file: 'doc.aux' },
      { severity: 'error', source: 'bibtex', message: 'Repeated entry', line: 1, file: 'errs.bib' },
      { severity: 'error', source: 'bibtex', message: 'A bad cross reference (entry "badxref") refers to entry "nosuchproc", which doesn\'t exist' },
      { severity: 'error', source: 'bibtex', message: 'I found no style file', file: 'doc.aux' },
    ]);
    expect(d.filter((x) => x.severity === 'warning')).toEqual([
      { severity: 'warning', source: 'bibtex', message: 'I didn\'t find a database entry for "nokey"' },
      { severity: 'warning', source: 'bibtex', message: 'string name "jphl" is undefined', line: 12, file: 'refs.bib' },
      { severity: 'warning', source: 'bibtex', message: 'empty year in broken' },
    ]);
  });
  it('finds nothing in a clean run', () => {
    expect(parseBibtexLog('This is BibTeX, Version 0.99d (TeX Live 2025)\nThe top-level auxiliary file: doc.aux\nThe style file: plainnat.bst\nDatabase file #1: refs.bib\n')).toEqual([]);
  });
});

describe('makeindex transcript', () => {
  it('finds input errors and output warnings with their place', () => {
    expect(parseMakeindexLog(ILG)).toEqual([
      { severity: 'error', source: 'makeindex', message: 'Missing arguments -- need two (premature LFD).', file: 'doc.idx', line: 40 },
      { severity: 'warning', source: 'makeindex', message: 'Unmatched range closing operator ).', file: 'doc.idx', line: 39 },
    ]);
  });
});
