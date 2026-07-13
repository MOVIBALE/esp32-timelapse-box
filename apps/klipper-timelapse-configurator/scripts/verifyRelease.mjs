import { runReleaseVerification } from "../src/release/verifyRelease.js";

const result = runReleaseVerification();

if (!result.ok) {
  process.exitCode = 1;
}
