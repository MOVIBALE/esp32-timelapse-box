export function enterRawReplSequence() {
  return "\r\x03\x03\x01";
}

export function exitRawReplSequence() {
  return "\x02";
}

export function buildRawExecCommand(code) {
  return `${code}\x04`;
}

export function buildRawExecAndExitCommand(code) {
  return `${buildRawExecCommand(code)}${exitRawReplSequence()}`;
}

export function buildSoftResetCommand() {
  return `${exitRawReplSequence()}\x04`;
}

export async function rawExec(connection, code, sleep = defaultSleep) {
  await connection.write(enterRawReplSequence());
  await sleep(350);
  await connection.write(buildRawExecAndExitCommand(code));
  await sleep(180);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
