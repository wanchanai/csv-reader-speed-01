// Fast drop-in replacement for csv-reader 1.0.0.
//
// A single left-to-right pass built on native indexOf scans and slices,
// never per-character string concatenation:
//  - unquoted fields end at the first comma or at the current line's end
//    (the line end is found once per physical line and reused), and are a
//    single slice unless a stray CR interrupts them;
//  - quoted fields locate their closing quote with indexOf, take their
//    content as one slice, and only rebuild when a doubled quote or a CR
//    inside forces it (via native replace), counting line breaks after the
//    rebuild, where every break is a single LF;
//  - the slow paths (stray CRs, junk after a closing quote, an unterminated
//    quote) are rare and reuse a plain scanner with the reference semantics.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;
  // Index of the '\n' that ends the physical line at pos, or len at the end
  // of the text. Recomputed whenever pos moves past it.
  let lineEnd = -1;

  // Plain scanner for unquoted text starting at pos, with `prefix` already
  // kept. Returns [value, ended, added]: ended 0 = comma, 1 = line break,
  // 2 = end of text; added counts the characters kept beyond the prefix.
  function readUnquotedSlow(prefix) {
    let parts = null;
    let start = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44 || c === 10) {
        const tail = text.slice(start, pos);
        pos += 1;
        if (c === 10) line += 1;
        if (parts === null) return [prefix + tail, c === 44 ? 0 : 1, tail.length];
        parts.push(tail);
        const v = parts.join('');
        return [v, c === 44 ? 0 : 1, v.length - prefix.length];
      }
      if (c === 13) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
          const tail = text.slice(start, pos);
          pos += 2;
          line += 1;
          if (parts === null) return [prefix + tail, 1, tail.length];
          parts.push(tail);
          const v = parts.join('');
          return [v, 1, v.length - prefix.length];
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [prefix];
        parts.push(text.slice(start, pos));
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    const tail = text.slice(start, pos);
    if (parts === null) return [prefix + tail, 2, tail.length];
    parts.push(tail);
    const v = parts.join('');
    return [v, 2, v.length - prefix.length];
  }

  let fVal = '';
  let fEnded = 2;
  // An unquoted field: one slice in the common case; sets fVal/fEnded.
  function readUnquoted() {
    if (lineEnd < pos) {
      const nl = text.indexOf('\n', pos);
      lineEnd = nl === -1 ? len : nl;
    }
    const comma = text.indexOf(',', pos);
    let fieldEnd, ended;
    if (comma !== -1 && comma < lineEnd) {
      fieldEnd = comma;
      ended = 0;
    } else {
      fieldEnd = lineEnd;
      ended = lineEnd < len ? 1 : 2;
    }
    const seg = text.slice(pos, fieldEnd);
    const cr = seg.indexOf('\r');
    if (cr === -1) {
      pos = ended === 2 ? fieldEnd : fieldEnd + 1;
      if (ended === 1) line += 1;
      fVal = seg; fEnded = ended;
      return;
    }
    if (ended === 1 && cr === seg.length - 1) {
      // The CR of the closing CRLF.
      pos = fieldEnd + 1;
      line += 1;
      fVal = seg.slice(0, -1); fEnded = 1;
      return;
    }
    const r = readUnquotedSlow('');
    fVal = r[0]; fEnded = r[1];
  }

  // A quoted field whose opening quote is at pos; sets fVal/fEnded.
  function readQuoted() {
    const open = pos;
    // Find the closing quote: the first quote that is not doubled.
    let scan = open + 1;
    let close = -1;
    let doubled = false;
    while (scan < len) {
      const idx = text.indexOf('"', scan);
      if (idx === -1) break;
      if (idx + 1 < len && text.charCodeAt(idx + 1) === 34) {
        doubled = true;
        scan = idx + 2;
        continue;
      }
      close = idx;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      const r = readUnquotedSlow('"');
      fVal = r[0]; fEnded = r[1];
      return;
    }
    let value = text.slice(open + 1, close);
    const hasCR = value.indexOf('\r') !== -1;
    if (doubled) value = value.replaceAll('""', '"');
    if (hasCR) value = value.replace(/\r\n|\r/g, '\n');
    // Count the line breaks inside: after any rebuild every break is one
    // LF, and without a CR every break already was one.
    let k = value.indexOf('\n');
    while (k !== -1) {
      line += 1;
      k = value.indexOf('\n', k + 1);
    }
    pos = close + 1;
    if (pos >= len) { fVal = value; fEnded = 2; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fVal = value; fEnded = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fVal = value; fEnded = 1;
      return;
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fVal = value; fEnded = 1;
      return;
    }
    // What follows the closing quote is appended as it stands.
    const junk = readUnquotedSlow(value);
    if (junk[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    fVal = junk[0]; fEnded = junk[1];
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    lineEnd = -1;

    const fields = [];
    let lastQuoted = false;
    let ended;
    do {
      lastQuoted = pos < len && text.charCodeAt(pos) === 34;
      if (lastQuoted) readQuoted(); else readUnquoted();
      fields.push(fVal);
      ended = fEnded;
    } while (ended === 0);

    // A line that held only stray CRs is no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
