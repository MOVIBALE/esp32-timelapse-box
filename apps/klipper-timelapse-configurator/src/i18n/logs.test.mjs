import assert from "node:assert/strict";
import test from "node:test";

import { explainRawLog, visibleLogText } from "./logs.js";

test("explainRawLog translates board readiness for beginners", () => {
  const line = explainRawLog('__BOARD_LISTENER_READY__{"enabled":true,"dry_run":true}', "zh-CN", 1);

  assert.equal(line.level, "success");
  assert.match(visibleLogText(line, "zh-CN"), /板载监听器已启动/);
});

test("explainRawLog translates dry-run trigger event", () => {
  const line = explainRawLog('__BOARD_LISTENER_EVENT__{"layer":234,"trigger_result":"DRY_RUN"}', "zh-CN", 1);

  assert.equal(line.level, "success");
  assert.match(visibleLogText(line, "zh-CN"), /安全模式/);
});

test("explainRawLog marks errors", () => {
  const line = explainRawLog("Traceback: boom", "en", 1);

  assert.equal(line.level, "error");
});

test("explainRawLog translates S3 Sony readiness", () => {
  const line = explainRawLog(
    "SONY_BLUEDROID_SHUTTER_STATUS connected=true ready=true",
    "zh-CN",
    1
  );

  assert.equal(line.level, "success");
  assert.match(visibleLogText(line, "zh-CN"), /Sony 相机已连接并可拍摄/);
  assert.match(visibleLogText(line, "en"), /Sony camera is connected and ready/);
});

test("explainRawLog translates first-time Sony pairing without implying a photo", () => {
  const start = explainRawLog(
    "SONY_BLUEDROID_SHUTTER_PAIRING_START no_ff01_writes=true",
    "zh-CN",
    1
  );
  const done = explainRawLog(
    "SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true no_ff01_writes=true",
    "zh-CN",
    2
  );

  assert.match(visibleLogText(start, "zh-CN"), /配对/);
  assert.match(visibleLogText(start, "en"), /pairing/i);
  assert.equal(done.level, "success");
  assert.match(visibleLogText(done, "zh-CN"), /配对完成/);
  assert.match(visibleLogText(done, "zh-CN"), /不会触发快门/);
  assert.match(visibleLogText(done, "en"), /will not trigger the shutter/i);
});

test("explainRawLog translates S3 dry-run macro events", () => {
  const line = explainRawLog(
    "TIMELAPSE_MACRO_EVENT action=trigger macro_source=canonical layer=42 dry_run=true",
    "zh-CN",
    1
  );

  assert.equal(line.level, "success");
  assert.match(visibleLogText(line, "zh-CN"), /第 42 层/);
  assert.match(visibleLogText(line, "zh-CN"), /不会触发快门/);
});

test("explainRawLog makes rejected S3 commands actionable", () => {
  const line = explainRawLog(
    "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=b accepted=false reason=no_bonded_target",
    "en",
    1
  );

  assert.equal(line.level, "error");
  assert.match(visibleLogText(line, "en"), /did not accept/);
});
