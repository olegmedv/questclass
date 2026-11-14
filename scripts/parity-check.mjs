#!/usr/bin/env node
// Checks docs/PARITY.md against the parity checklists in docs/spec/01–04 (FEAT-051).
//
// Every checklist line of a spec (`- [ ]`, ticked `- [x]` too) must have exactly one row in the
// table of that spec, in the same order, with:
//   - ID `<spec>-<NNN>` (1-based position in the checklist);
//   - the same text (a shortened row text ends with «…» and must be a prefix of the spec line);
//   - a valid label and a Y/N decision; every FEAT id must exist in FEATURE_PLAN.md;
//   - «MVP → нет FEAT (G-N)» must point to a `### G-N` entry of «MVP-пункты без FEAT».
// The «Сводка» table must match the computed counts.
//
// Usage: node scripts/parity-check.mjs [--strict]
//   --strict  also fails while rows labelled «MVP → нет FEAT» remain (gate before phase C).
// Node 22, no dependencies. Exit code 1 on any problem.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS = [
  { id: '01', path: 'docs/spec/01-learning-core.md' },
  { id: '02', path: 'docs/spec/02-game-economy.md' },
  { id: '03', path: 'docs/spec/03-reminders-notifications-clients.md' },
  { id: '04', path: 'docs/spec/04-star-assistant.md' },
];
const PARITY_PATH = 'docs/PARITY.md';
const PLAN_PATH = 'FEATURE_PLAN.md';
const GAPS_HEADING = 'MVP-пункты без FEAT';
const SUMMARY_HEADING = 'Сводка';
const COLUMNS = 6; // ID | Раздел | Пункт | Метка | Нужно решение пользователя (Y/N) | Примечание

const KINDS = ['MVP', 'Покрыто иначе', 'Этап 2', 'Этап 3', 'Не переносить'];
const FEAT_LIST = String.raw`FEAT-\d{3}(?:, FEAT-\d{3})*`;
const LABEL_RULES = [
  { kind: 'MVP', re: new RegExp(String.raw`^MVP → (?:(${FEAT_LIST})|нет FEAT \((G-\d+)\))$`) },
  { kind: 'Покрыто иначе', re: new RegExp(String.raw`^Покрыто иначе → (${FEAT_LIST}) \(.+\)$`) },
  { kind: 'Этап 2', re: /^Этап 2$/ },
  { kind: 'Этап 3', re: /^Этап 3$/ },
  { kind: 'Не переносить', re: /^Не переносить \(.+\)$/ },
];
const CHECKLIST_LINE = /^\s*[-*] \[[ xX]\] +(.*\S)\s*$/;
const ELLIPSIS = '…';

const strict = process.argv.includes('--strict');
const errors = [];
const warnings = [];

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n?/g, '\n');
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const clip = (s, n = 70) => (s.length > n ? `${s.slice(0, n)}${ELLIPSIS}` : s);

function specItems(rel) {
  return read(rel)
    .split('\n')
    .map((line) => CHECKLIST_LINE.exec(line))
    .filter(Boolean)
    .map((m) => norm(m[1]));
}

// Splits a Markdown table row on unescaped pipes and unescapes `\|` inside cells.
function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

const isSeparator = (cells) => cells.every((c) => /^:?-{3,}:?$/.test(c));

function classify(label) {
  for (const rule of LABEL_RULES) {
    const m = rule.re.exec(label);
    if (m) {
      const feats = rule.kind === 'MVP' || rule.kind === 'Покрыто иначе' ? (m[1] ?? '').match(/FEAT-\d{3}/g) ?? [] : [];
      return { kind: rule.kind, feats, gap: rule.kind === 'MVP' ? m[2] ?? null : null };
    }
  }
  return null;
}

function parseParity(text) {
  const rows = new Map(SPECS.map((s) => [s.id, []]));
  const summary = new Map();
  const gaps = new Set();
  let section = null;
  text.split('\n').forEach((line, index) => {
    if (line.startsWith('## ')) {
      const spec = SPECS.find((s) => line.includes(basename(s.path)));
      if (spec) section = spec.id;
      else if (line.includes(GAPS_HEADING)) section = 'gaps';
      else if (line.includes(SUMMARY_HEADING)) section = 'summary';
      else section = null;
      return;
    }
    if (section === 'gaps') {
      const m = /^### (G-\d+)\b/.exec(line);
      if (m) gaps.add(m[1]);
      return;
    }
    if (section === null || !line.trimStart().startsWith('|')) return;
    const cells = splitRow(line);
    if (isSeparator(cells)) return;
    if (section === 'summary') {
      const spec = SPECS.find((s) => cells[0].includes(basename(s.path)));
      const key = spec ? spec.id : cells[0] === 'Итого' ? 'total' : null;
      if (key) summary.set(key, { lineNo: index + 1, values: cells.slice(1).map(Number) });
      return;
    }
    if (cells[0] === 'ID') return; // header row
    rows.get(section).push({ lineNo: index + 1, cells });
  });
  return { rows, summary, gaps };
}

function emptyCounts() {
  return { items: 0, rows: 0, ...Object.fromEntries(KINDS.map((k) => [k, 0])), noFeat: 0, decisionY: 0 };
}

// Order of «Сводка» columns after «Файл».
const SUMMARY_COLUMNS = [
  ['items', 'Пунктов'],
  ['MVP', 'MVP'],
  ['noFeat', 'в т.ч. без FEAT'],
  ['Покрыто иначе', 'Покрыто иначе'],
  ['Этап 2', 'Этап 2'],
  ['Этап 3', 'Этап 3'],
  ['Не переносить', 'Не переносить'],
  ['decisionY', 'Решение = Y'],
];

function main() {
  if (!existsSync(join(ROOT, PARITY_PATH))) {
    console.error(`Нет файла ${PARITY_PATH}`);
    process.exit(1);
  }
  const parity = parseParity(read(PARITY_PATH));
  const planFeats = existsSync(join(ROOT, PLAN_PATH))
    ? new Set([...read(PLAN_PATH).matchAll(/^### (FEAT-\d{3})\b/gm)].map((m) => m[1]))
    : null;
  if (!planFeats) warnings.push(`${PLAN_PATH} не найден — существование FEAT не проверяется`);

  const usedGaps = new Set();
  const noFeatRows = [];
  const totals = emptyCounts();
  const perSpec = [];

  for (const spec of SPECS) {
    const items = specItems(spec.path);
    const rows = parity.rows.get(spec.id);
    const counts = emptyCounts();
    counts.items = items.length;
    counts.rows = rows.length;
    if (items.length !== rows.length) {
      errors.push(`${spec.id}: в ${spec.path} пунктов ${items.length}, в ${PARITY_PATH} строк ${rows.length}`);
    }
    for (let i = 0; i < Math.max(items.length, rows.length); i++) {
      const expectedId = `${spec.id}-${String(i + 1).padStart(3, '0')}`;
      const item = items[i];
      const row = rows[i];
      if (!row) {
        errors.push(`${expectedId}: нет строки с меткой для пункта «${clip(item)}»`);
        continue;
      }
      const where = `${PARITY_PATH}:${row.lineNo} (${expectedId})`;
      if (item === undefined) {
        errors.push(`${where}: лишняя строка — в спеке нет пункта №${i + 1}`);
        continue;
      }
      if (row.cells.length !== COLUMNS) {
        errors.push(`${where}: ожидается ${COLUMNS} колонок, найдено ${row.cells.length} (неэкранированный «|»?)`);
        continue;
      }
      const [id, , text, label, decision] = row.cells;
      if (id !== expectedId) errors.push(`${where}: ID «${id}», ожидается «${expectedId}»`);

      const shortened = text.endsWith(ELLIPSIS);
      const shown = norm(shortened ? text.slice(0, -ELLIPSIS.length) : text);
      const textOk = shortened ? shown.length >= Math.min(20, item.length) && item.startsWith(shown) : shown === item;
      if (!textOk) errors.push(`${where}: текст не совпадает с пунктом спеки «${clip(item)}»`);

      const cls = classify(label);
      if (!cls) {
        errors.push(`${where}: нет или неверная метка «${label}»`);
      } else {
        counts[cls.kind]++;
        for (const feat of cls.feats) {
          if (planFeats && !planFeats.has(feat)) errors.push(`${where}: ${feat} нет в ${PLAN_PATH}`);
        }
        if (cls.gap) {
          counts.noFeat++;
          usedGaps.add(cls.gap);
          noFeatRows.push(`${expectedId} → ${cls.gap}`);
          if (!parity.gaps.has(cls.gap)) errors.push(`${where}: ${cls.gap} нет в разделе «${GAPS_HEADING}»`);
        }
      }
      if (decision === 'Y') counts.decisionY++;
      else if (decision !== 'N') errors.push(`${where}: «Нужно решение пользователя» должно быть Y или N, найдено «${decision}»`);
    }
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    perSpec.push({ spec, counts });
  }

  for (const gap of parity.gaps) {
    if (!usedGaps.has(gap)) warnings.push(`${gap} описан в «${GAPS_HEADING}», но ни одна строка на него не ссылается`);
  }

  // «Сводка» must match the computed counts.
  for (const [key, counts, name] of [
    ...perSpec.map(({ spec, counts }) => [spec.id, counts, basename(spec.path)]),
    ['total', totals, 'Итого'],
  ]) {
    const row = parity.summary.get(key);
    if (!row) {
      errors.push(`«${SUMMARY_HEADING}»: нет строки «${name}»`);
      continue;
    }
    SUMMARY_COLUMNS.forEach(([field, title], i) => {
      if (row.values[i] !== counts[field]) {
        errors.push(`${PARITY_PATH}:${row.lineNo}: «${SUMMARY_HEADING}», ${name}, «${title}» = ${row.values[i]}, по таблице ${counts[field]}`);
      }
    });
  }

  const line = (name, c) =>
    `${name}: пунктов ${c.items}, строк ${c.rows} · MVP ${c.MVP} (без FEAT ${c.noFeat}) · Покрыто иначе ${c['Покрыто иначе']} · ` +
    `Этап 2 ${c['Этап 2']} · Этап 3 ${c['Этап 3']} · Не переносить ${c['Не переносить']} · решение Y ${c.decisionY}`;
  console.log(`Паритет: ${PARITY_PATH}`);
  for (const { spec, counts } of perSpec) console.log(`  ${line(basename(spec.path), counts)}`);
  console.log(`  ${line('Итого', totals)}`);

  if (noFeatRows.length > 0) {
    const message = `MVP-пункты без FEAT (дописать в план до фазы C): ${noFeatRows.join(', ')}`;
    if (strict) errors.push(message);
    else warnings.push(message);
  }
  for (const w of warnings) console.warn(`ВНИМАНИЕ: ${w}`);
  if (errors.length > 0) {
    console.error(`\nОшибок: ${errors.length}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('OK: каждая строка чеклистов размечена.');
}

main();
