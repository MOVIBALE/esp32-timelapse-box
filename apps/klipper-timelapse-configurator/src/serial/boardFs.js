const APPROVED_UPLOAD_PATHS = new Set(["/board_listener_config.json", "/board_listener.py", "/main.py"]);

export function buildWriteTextFileCommands(path, text, chunkSize = 512) {
  if (!APPROVED_UPLOAD_PATHS.has(path)) {
    throw new Error(`refusing board path: ${path}`);
  }

  const commands = [
    [
      `open(${JSON.stringify(path)}, "w").close()`,
      `print("__FS_TRUNCATED__${path}")`
    ].join("\n")
  ];

  for (let index = 0; index < text.length; index += chunkSize) {
    const chunk = text.slice(index, index + chunkSize);
    commands.push(
      [
        `f = open(${JSON.stringify(path)}, "a")`,
        `f.write(${JSON.stringify(chunk)})`,
        "f.close()",
        `print("__FS_CHUNK__${path}:${index}")`
      ].join("\n")
    );
  }

  return commands;
}

export function buildBoardUploadManifest({ configText, listenerText, mainText }) {
  return [
    { path: "/board_listener_config.json", text: configText },
    { path: "/board_listener.py", text: listenerText },
    { path: "/main.py", text: mainText }
  ];
}

export function buildListFilesCommand() {
  return "import os, json\nprint('__FS_LIST__' + json.dumps(os.listdir('/')))";
}

export function buildRemoveMainCommand() {
  return [
    "import os",
    "try:",
    `    os.remove(${JSON.stringify("/main.py")})`,
    "    print('__FS_MAIN_REMOVED__')",
    "except OSError as exc:",
    "    print('__FS_MAIN_REMOVE_SKIPPED__' + repr(exc))"
  ].join("\n");
}
