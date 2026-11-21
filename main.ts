import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as { run: (input: unknown) => unknown };
const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
let first = true;
for (const c of cases) {
  if (!first) writeSync(fd, ',');
  first = false;
  writeSync(fd, JSON.stringify(run(c.input)));
}
writeSync(fd, ']');
closeSync(fd);
