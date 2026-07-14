import assert from "node:assert/strict";
import test from "node:test";

import { removeTemporaryDirectory } from "../scripts/smokeCleanup.mjs";

test("removeTemporaryDirectory retries transient Windows handle errors", async () => {
  const attempts = [];
  const waits = [];

  await removeTemporaryDirectory("C:/tmp/chrome-profile", {
    remove(path, options) {
      attempts.push({ path, options });
      if (attempts.length < 3) {
        const error = new Error("profile still locked");
        error.code = "EPERM";
        throw error;
      }
    },
    wait(milliseconds) {
      waits.push(milliseconds);
    }
  });

  assert.equal(attempts.length, 3);
  assert.deepEqual(waits, [250, 250]);
  assert.deepEqual(attempts[0], {
    path: "C:/tmp/chrome-profile",
    options: { recursive: true, force: true }
  });
});

test("removeTemporaryDirectory does not hide non-transient failures", async () => {
  const error = new Error("invalid path");
  error.code = "EINVAL";

  await assert.rejects(
    removeTemporaryDirectory("bad-path", {
      remove() {
        throw error;
      },
      wait() {
        throw new Error("wait should not run");
      }
    }),
    error
  );
});
