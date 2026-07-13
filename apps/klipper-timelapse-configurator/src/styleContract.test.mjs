import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "src/styles/workbench.css"), "utf-8");

test("three-column workbench minimum width fits a 1280px desktop viewport", () => {
  const match = css.match(/grid-template-columns:\s*(\d+)px\s+minmax\((\d+)px,\s*1fr\)\s+minmax\((\d+)px,\s*0\.85fr\)/);
  assert.ok(match, "expected explicit three-column grid contract");

  const [, rail, workbench, logs] = match.map(Number);
  const shellGutter = 48;
  const gridGaps = 32;
  assert.ok(rail + workbench + logs + shellGutter + gridGaps <= 1280);
});

test("workbench styling avoids orb-like radial gradient decoration", () => {
  assert.doesNotMatch(css, /radial-gradient/i);
});

test("workbench motion has a reduced-motion fallback", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none/);
}
);

test("mobile header prevents status chips from overflowing", () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /\.app-shell\s*{[^}]*width:\s*calc\(100vw\s*-\s*32px\)/s);
  assert.match(css, /\.topbar\s*{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.status-strip\s*{[^}]*flex-basis:\s*100%/s);
  assert.match(css, /\.status-strip\s*{[^}]*grid-template-columns:\s*1fr/s);
});

test("mobile recovery strip stacks status text instead of clipping it", () => {
  const mobileRule = css.match(/@media\s*\(max-width:\s*640px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 640px mobile layout block");

  const body = mobileRule.groups.body;
  assert.match(body, /\.recovery-strip\s*{[^}]*flex-direction:\s*column/s);
  assert.match(body, /\.recovery-strip\s*{[^}]*align-items:\s*flex-start/s);
  assert.match(body, /\.recovery-strip strong\s*{[^}]*text-align:\s*left/s);
});

test("mobile safety mode tabs use a stable two-column grid that avoids clipping", () => {
  const mobileRule = css.match(/@media\s*\(max-width:\s*640px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 640px mobile layout block");

  const body = mobileRule.groups.body;
  assert.match(body, /\.section-head\s*{[^}]*flex-direction:\s*column/s);
  assert.match(body, /\.section-head\s*{[^}]*width:\s*100%/s);
  assert.match(body, /\.section-head > \*\s*{[^}]*max-width:\s*100%/s);
  assert.match(body, /\.mode-tabs\s*{[^}]*display:\s*grid/s);
  assert.match(body, /\.mode-tabs\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(body, /\.mode-tabs > span\s*{[^}]*width:\s*auto/s);
  assert.match(body, /\.mode-tabs > span\s*{[^}]*padding:\s*8px\s+6px/s);
});

test("single-column layout puts the primary workbench before secondary panels", () => {
  const mobileRule = css.match(/@media\s*\(max-width:\s*1180px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 1180px mobile layout block");

  const body = mobileRule.groups.body;
  assert.match(body, /\.workbench\s*{[^}]*order:\s*1/s);
  assert.match(body, /\.rail\s*{[^}]*order:\s*2/s);
  assert.match(body, /\.logs\s*{[^}]*order:\s*3/s);
});

test("safety status has a distinct recovered tone", () => {
  assert.match(css, /\.status\[data-tone="recovered"\]/);
});

test("safety mode tabs have distinct active tones", () => {
  assert.match(css, /\.mode-tabs span\[data-mode="disabled"\]\[data-active="true"\]/);
  assert.match(css, /\.mode-tabs span\[data-mode="dry-run"\]\[data-active="true"\]/);
  assert.match(css, /\.mode-tabs span\[data-mode="armed"\]\[data-active="true"\]/);
});

test("hardware routes use a stable segmented control with a clear active state", () => {
  assert.match(css, /\.route-segment\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.route-segment\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.route-segment button\[aria-pressed="true"\]/);

  const mobileRule = css.match(/@media\s*\(max-width:\s*640px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 640px mobile layout block");
  assert.match(mobileRule.groups.body, /\.route-segment\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobileRule.groups.body, /h1\s*{[^}]*font-size:\s*28px/s);
});

test("beginner tutorial checklist has fixed status markers and mobile-safe rows", () => {
  assert.match(css, /\.tutorial-checklist\s*{/);
  assert.match(css, /\.step-cue\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.step-cue\s+strong\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.checklist-summary\s*{[^}]*max-width:\s*100%/s);
  assert.match(css, /\.checklist-summary\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.checklist-row\s*{[^}]*grid-template-columns:\s*24px\s+1fr\s+minmax\(74px,\s*auto\)/s);
  assert.match(css, /\.checklist-row\[data-state="done"\]/);
  assert.match(css, /\.checklist-row\[data-state="current"\]/);

  const mobileRule = css.match(/@media\s*\(max-width:\s*640px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 640px mobile layout block");
  assert.match(mobileRule.groups.body, /\.checklist-row\s*{[^}]*grid-template-columns:\s*24px\s+1fr/s);
});

test("primary workbench actions use a compact stable grid before the checklist", () => {
  assert.match(css, /\.workbench\s*>\s*\.actions\s*{[^}]*display:\s*grid/s);
  assert.match(css, /\.workbench\s*>\s*\.actions\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.workbench\s*>\s*\.actions\s*>\s*\.primary\s*{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  assert.match(css, /\.workbench\s*>\s*\.actions\s+button\s*{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.workbench\s*>\s*\.actions\s+button\s*{[^}]*word-break:\s*break-all/s);

  const mobileRule = css.match(/@media\s*\(max-width:\s*640px\)\s*{(?<body>[\s\S]*?)\n}/);
  assert.ok(mobileRule?.groups?.body, "expected a max-width 640px mobile layout block");
  assert.match(mobileRule.groups.body, /\.workbench\s*>\s*\.actions\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(mobileRule.groups.body, /\.workbench\s*>\s*\.actions\s+button\s*{[^}]*font-size:\s*13px/s);
});

test("advanced diagnostics copy is visually secondary to the beginner workflow", () => {
  assert.match(css, /\.advanced-copy\s*{/);
  assert.match(css, /\.advanced-copy\s*{[^}]*color:\s*var\(--muted\)/s);
  assert.match(css, /\.advanced-copy\s*{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.advanced-copy\s*{[^}]*max-width:\s*64ch/s);
});
