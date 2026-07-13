import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRawExecAndExitCommand,
  buildRawExecCommand,
  buildSoftResetCommand,
  enterRawReplSequence,
  exitRawReplSequence
} from "./rawRepl.js";

test("enterRawReplSequence interrupts and enters raw REPL", () => {
  assert.equal(enterRawReplSequence(), "\r\x03\x03\x01");
});

test("exitRawReplSequence returns to friendly REPL", () => {
  assert.equal(exitRawReplSequence(), "\x02");
});

test("buildRawExecCommand terminates code with Ctrl-D", () => {
  assert.equal(buildRawExecCommand("print('ok')"), "print('ok')\x04");
});

test("buildRawExecAndExitCommand exits raw REPL after execution", () => {
  assert.equal(buildRawExecAndExitCommand("print('ok')"), "print('ok')\x04\x02");
});

test("buildSoftResetCommand leaves raw REPL before soft reset", () => {
  assert.equal(buildSoftResetCommand(), "\x02\x04");
});
