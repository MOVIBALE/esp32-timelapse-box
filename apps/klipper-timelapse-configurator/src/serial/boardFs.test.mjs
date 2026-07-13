import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBoardUploadManifest,
  buildListFilesCommand,
  buildRemoveMainCommand,
  buildWriteTextFileCommands
} from "./boardFs.js";

test("buildWriteTextFileCommands chunks approved board files", () => {
  const commands = buildWriteTextFileCommands("/board_listener.py", "abcdef", 3);

  assert.equal(commands.length, 3);
  assert.match(commands[0], /__FS_TRUNCATED__\/board_listener\.py/);
  assert.match(commands[1], /__FS_CHUNK__\/board_listener\.py:0/);
  assert.match(commands[2], /__FS_CHUNK__\/board_listener\.py:3/);
});

test("buildWriteTextFileCommands rejects unsafe board paths", () => {
  assert.throws(() => buildWriteTextFileCommands("/boot.py", "x"), /refusing board path/);
  assert.throws(() => buildWriteTextFileCommands("../main.py", "x"), /refusing board path/);
});

test("buildBoardUploadManifest uploads config, listener, and main shim only", () => {
  const manifest = buildBoardUploadManifest({
    configText: "{}",
    listenerText: "listener",
    mainText: "main"
  });

  assert.deepEqual(
    manifest.map((item) => item.path),
    ["/board_listener_config.json", "/board_listener.py", "/main.py"]
  );
});

test("buildRemoveMainCommand only removes main.py for recovery", () => {
  const command = buildRemoveMainCommand();

  assert.match(command, /os\.remove\("\/main\.py"\)/);
  assert.match(command, /__FS_MAIN_REMOVED__/);
  assert.doesNotMatch(command, /board_listener\.py|boot\.py/);
});

test("buildListFilesCommand emits the filesystem marker", () => {
  assert.match(buildListFilesCommand(), /__FS_LIST__/);
});
