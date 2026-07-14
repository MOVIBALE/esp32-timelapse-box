import { rmSync as defaultRemove } from "node:fs";

const RETRYABLE_CODES = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);

export async function removeTemporaryDirectory(path, {
  remove = defaultRemove,
  wait = delay,
  maxAttempts = 20,
  retryDelayMs = 250
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      remove(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!RETRYABLE_CODES.has(error?.code) || attempt === maxAttempts) throw error;
      await wait(retryDelayMs);
    }
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
