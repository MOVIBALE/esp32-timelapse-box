import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const firmwareMainPath =
  "firmware/esp32-s3-sony-ble-timelapse/main/sony_bluedroid_shutter_probe.c";
const firmwareConfigPath = "firmware/esp32-s3-sony-ble-timelapse/platformio.ini";
const firmwareReadmePath = "firmware/esp32-s3-sony-ble-timelapse/README.md";
const firmwarePartitionsPath = "firmware/esp32-s3-sony-ble-timelapse/partitions.csv";
const firmwareDefaultsPath = "firmware/esp32-s3-sony-ble-timelapse/sdkconfig.defaults";

test("ESP32-S3 firmware polls Moonraker layer changes and gates Sony shutter behind dry-run or armed mode", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const config = readFileSync(firmwareConfigPath, "utf-8");
  const readme = readFileSync(firmwareReadmePath, "utf-8");

  assert.doesNotMatch(main, /ESP32_TIMELAPSE_SHOT/);

  assert.match(config, /KLIPPER_SONY_TIMELAPSE_BOX=1/);
  assert.match(config, /TIMELAPSE_DRY_RUN_DEFAULT=1/);
  assert.match(config, /TIMELAPSE_SERIAL_ARM_REQUIRED=1/);

  assert.match(main, /esp_wifi_init\s*\(/);
  assert.match(main, /esp_wifi_connect\s*\(/);
  assert.match(main, /esp_http_client_init\s*\(/);
  assert.match(
    main,
    /\/printer\/objects\/query\?gcode_macro%20ESP_TIMELAPSE_SHOT&gcode_macro%20CYBERBRICK_SHOT&print_stats&timelapse&virtual_sdcard&gcode_move&exception_manager&webhooks/
  );
  assert.match(main, /cJSON_Parse\s*\(/);

  for (const guard of [
    "print_stats",
    "timelapse",
    "virtual_sdcard",
    "exception_manager",
    "webhooks",
    "current_layer",
    "total_layer",
    "min_trigger_interval_ms",
    "baseline_layer"
  ]) {
    assert.match(main, new RegExp(guard));
  }

  assert.match(main, /s_timelapse_dry_run\s*=\s*TIMELAPSE_DRY_RUN_DEFAULT/);
  assert.match(main, /s_timelapse_live_armed\s*=\s*false/);
  assert.match(main, /trigger_source=klipper_layer/);
  assert.match(main, /run_trigger_once_sequence\s*\(/);
  assert.match(main, /TIMELAPSE_LAYER_EVENT/);
  assert.match(main, /TIMELAPSE_TRIGGER_SKIP reason=dry_run_or_not_armed/);
  assert.doesNotMatch(main, /AUTO_TRIGGER_ON_BOOT|WRITE_FF01_ON_BOOT/);

  assert.match(readme, /Klipper/);
  assert.match(readme, /Moonraker/);
  assert.match(readme, /dry-run/);
  assert.match(readme, /armed/);
  assert.match(readme, /不会开机自动拍/);
});

test("ESP32-S3 timelapse firmware provisions Wi-Fi and Moonraker host over serial without committed passwords", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const config = readFileSync(firmwareConfigPath, "utf-8");
  const readme = readFileSync(firmwareReadmePath, "utf-8");

  assert.match(main, /nvs_open\s*\(/);
  assert.match(main, /nvs_get_str\s*\(/);
  assert.match(main, /nvs_set_str\s*\(/);
  assert.match(main, /timelapse_load_network_config\s*\(/);
  assert.match(main, /timelapse_save_network_config\s*\(/);
  assert.match(main, /TIMELAPSE_SERIAL_COMMAND trigger=w accepted=true/);
  assert.match(main, /ssid\|password\|host/);
  assert.match(main, /esp_wifi_set_config\s*\(/);
  assert.match(main, /esp_wifi_connect\s*\(/);

  assert.doesNotMatch(config, /TIMELAPSE_WIFI_PASSWORD=\\?"[^"\\]+\\?"/);
  assert.match(readme, /w SSID\|PASSWORD\|HOST/);
  assert.match(readme, /NVS/);
});

test("ESP32-S3 timelapse firmware uses an app partition large enough for Wi-Fi plus Bluedroid", () => {
  const config = readFileSync(firmwareConfigPath, "utf-8");
  const partitions = readFileSync(firmwarePartitionsPath, "utf-8");

  assert.match(config, /board_build\.partitions\s*=\s*partitions\.csv/);
  assert.match(partitions, /factory\s*,\s*app\s*,\s*factory\s*,\s*0x10000\s*,\s*(0x400000|4M)/);
  assert.doesNotMatch(partitions, /factory\s*,\s*app\s*,\s*factory\s*,\s*0x10000\s*,\s*0x100000/);
});

test("ESP32-S3 firmware pins the verified ESP-IDF build platform", () => {
  const config = readFileSync(firmwareConfigPath, "utf-8");

  assert.match(
    config,
    /platform\s*=\s*https:\/\/github\.com\/pioarduino\/platform-espressif32\/releases\/download\/55\.03\.38\/platform-espressif32\.zip/
  );
  assert.doesNotMatch(config, /^platform\s*=\s*espressif32\s*$/m);
});

test("ESP32-S3 firmware uses the single USB-C Serial/JTAG console for both logs and commands", () => {
  const defaults = readFileSync(firmwareDefaultsPath, "utf-8");

  assert.match(defaults, /CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG=y/);
  assert.match(defaults, /CONFIG_ESP_CONSOLE_SECONDARY_NONE=y/);
  assert.doesNotMatch(defaults, /CONFIG_ESP_CONSOLE_UART_DEFAULT=y/);
});

test("ESP32-S3 timelapse firmware releases unused Classic BT memory before Wi-Fi starts", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const appMain = main.slice(main.indexOf("void app_main(void)"));
  const releaseIndex = appMain.indexOf("esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT)");
  const wifiStartIndex = appMain.indexOf("timelapse_wifi_init_sta();");

  assert.notEqual(releaseIndex, -1, "expected Classic BT memory release");
  assert.notEqual(wifiStartIndex, -1, "expected Wi-Fi init call");
  assert.ok(releaseIndex < wifiStartIndex, "Classic BT memory must be released before Wi-Fi init");
});

test("ESP32-S3 timelapse firmware waits for initial Wi-Fi outcome before starting BLE", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const wifiInitStart = main.lastIndexOf("static void timelapse_wifi_init_sta(void)");
  const wifiInitEnd = main.indexOf("static esp_err_t timelapse_http_event_handler", wifiInitStart);
  const wifiInit = main.slice(wifiInitStart, wifiInitEnd);
  const appMain = main.slice(main.indexOf("void app_main(void)"));

  assert.match(wifiInit, /xEventGroupWaitBits\s*\(/);
  assert.match(wifiInit, /TIMELAPSE_WIFI_WAIT_TIMEOUT/);
  assert.ok(
    appMain.indexOf("timelapse_wifi_init_sta();") < appMain.indexOf("esp_bt_controller_init(&bt_cfg)"),
    "Wi-Fi init and initial wait should finish before BLE controller init"
  );
});

test("ESP32-S3 timelapse firmware uses coexistence-friendly Wi-Fi and BLE scan settings", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const scanParamsStart = main.indexOf("static esp_ble_scan_params_t s_scan_params");
  const scanParamsEnd = main.indexOf("static void print_hex_compact", scanParamsStart);
  const scanParams = main.slice(scanParamsStart, scanParamsEnd);
  const wifiInitStart = main.lastIndexOf("static void timelapse_wifi_init_sta(void)");
  const wifiInitEnd = main.indexOf("static esp_err_t timelapse_http_event_handler", wifiInitStart);
  const wifiInit = main.slice(wifiInitStart, wifiInitEnd);

  assert.match(scanParams, /scan_type\s*=\s*BLE_SCAN_TYPE_PASSIVE/);
  assert.match(scanParams, /scan_interval\s*=\s*ESP_BLE_GAP_SCAN_ITVL_MS\(160\)/);
  assert.match(scanParams, /scan_window\s*=\s*ESP_BLE_GAP_SCAN_WIN_MS\(30\)/);
  assert.match(main, /s_pairing_scan_params/);
  assert.match(main, /BLE_SCAN_TYPE_ACTIVE/);
  assert.match(wifiInit, /esp_wifi_set_ps\s*\(\s*WIFI_PS_NONE\s*\)/);
});

test("ESP32-S3 safely reconnects a bonded Sony on boot while retaining manual pairing and reconnect commands", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const config = readFileSync(firmwareConfigPath, "utf-8");
  const gattcRegisterStart = main.indexOf("case ESP_GATTC_REG_EVT:");
  const gattcRegisterEnd = main.indexOf("case ESP_GATTC_OPEN_EVT:", gattcRegisterStart);
  const gattcRegister = main.slice(gattcRegisterStart, gattcRegisterEnd);
  const serialStart = main.indexOf("static void serial_command_task");
  const serialEnd = main.indexOf("static void open_bonded_connection", serialStart);
  const serialCommands = main.slice(serialStart, serialEnd);

  assert.match(config, /TIMELAPSE_AUTO_RECONNECT_BONDED=1/);
  assert.match(main, /s_sony_scan_requested\s*=\s*false/);
  assert.match(main, /start_bonded_sony_scan\s*\(/);
  assert.match(gattcRegister, /start_bonded_sony_scan\("boot"\)/);
  assert.match(gattcRegister, /dry_run=true armed=false/);
  assert.doesNotMatch(gattcRegister, /run_trigger_once_sequence|COMMAND_FULL_DOWN|s_timelapse_live_armed\s*=\s*true/);
  assert.match(serialCommands, /command\s*==\s*'b'/);
  assert.match(serialCommands, /command\s*==\s*'q'/);
  assert.match(serialCommands, /SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=b accepted=true/);
  assert.match(main, /TIMELAPSE_SERIAL_COMMANDS commands=s,q,b,t,r,p,a,d,e,w/);
});

test("ESP32-S3 integrated firmware can perform first-time pairing without a probe or shutter write", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const readme = readFileSync(firmwareReadmePath, "utf-8");
  const pairingStart = main.indexOf("static bool start_sony_pairing_scan(const char *source)\n{");
  const pairingEnd = main.indexOf("static bool start_bonded_sony_scan(const char *source)\n{", pairingStart);
  const pairingFunction = main.slice(pairingStart, pairingEnd);

  assert.match(main, /s_pairing_requested\s*=\s*false/);
  assert.match(pairingFunction, /s_timelapse_live_armed\s*=\s*false/);
  assert.match(pairingFunction, /s_timelapse_dry_run\s*=\s*true/);
  assert.match(pairingFunction, /esp_ble_gap_set_scan_params\s*\(\s*&s_pairing_scan_params\s*\)/);
  assert.doesNotMatch(pairingFunction, /run_trigger_once_sequence|write_sony_command|COMMAND_FULL_DOWN/);
  assert.match(main, /pairing_open\s*&&\s*remote_enabled/);
  assert.match(main, /SONY_BLUEDROID_SHUTTER_PAIRING_START/);
  assert.match(main, /SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true no_ff01_writes=true/);
  assert.match(main, /ESP_GAP_BLE_NC_REQ_EVT/);
  assert.match(main, /esp_ble_confirm_reply\s*\(/);
  assert.match(readme, /q = start first-time Sony pairing/);
  assert.match(readme, /no FF01|不写 FF01/i);
});

test("ESP32-S3 firmware resets Sony service state before reconnecting", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");

  assert.match(main, /static void reset_sony_connection_state\s*\(/);
  assert.match(main, /s_search_started\s*=\s*false/);
  assert.match(main, /s_command_handle\s*=\s*0/);
  assert.match(main, /s_notify_handle\s*=\s*0/);
  assert.match(main, /s_ready_for_serial_trigger\s*=\s*false/);
  assert.match(main, /reset_sony_connection_state\s*\(\s*\);[\s\S]*esp_ble_gattc_enh_open/);
});

test("ESP32-S3 timelapse firmware pauses Moonraker polling while Sony BLE is scanning or connecting", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const pollStart = main.indexOf("static void timelapse_poll_task");
  const pollEnd = main.indexOf("static void configure_security", pollStart);
  const pollTask = main.slice(pollStart, pollEnd);

  assert.match(main, /sony_ble_is_busy\s*\(/);
  assert.match(pollTask, /sony_ble_is_busy\s*\(\s*\)/);
  assert.match(pollTask, /TIMELAPSE_POLL_SKIP reason=sony_ble_busy/);
  assert.ok(
    pollTask.indexOf("sony_ble_is_busy()") < pollTask.indexOf("timelapse_fetch_moonraker_status"),
    "poll task should skip before starting HTTP while Sony BLE is scanning or connecting"
  );
});

test("ESP32-S3 timelapse firmware separates BT tasks from Wi-Fi and increases event-loop stack", () => {
  const config = readFileSync(
    "firmware/esp32-s3-sony-ble-timelapse/sdkconfig.defaults",
    "utf-8"
  );

  assert.match(config, /CONFIG_BT_BLUEDROID_PINNED_TO_CORE_1=y/);
  assert.match(config, /CONFIG_BT_CTRL_PINNED_TO_CORE_1=y/);
  assert.match(config, /CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=6144/);
  assert.doesNotMatch(config, /CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=2304/);
});

test("ESP32-S3 timelapse firmware reads SnapOrca layer info from print_stats.info with a Z-height fallback", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");

  assert.match(
    main,
    /\/printer\/objects\/query\?gcode_macro%20ESP_TIMELAPSE_SHOT&gcode_macro%20CYBERBRICK_SHOT&print_stats&timelapse&virtual_sdcard&gcode_move&exception_manager&webhooks/
  );
  assert.match(main, /cJSON_GetObjectItemCaseSensitive\s*\(\s*print_stats\s*,\s*"info"\s*\)/);
  assert.match(main, /json_int_value\s*\(\s*print_stats_info\s*,\s*"current_layer"\s*,/);
  assert.match(main, /json_int_value\s*\(\s*print_stats_info\s*,\s*"total_layer"\s*,/);
  assert.match(main, /cJSON_GetObjectItemCaseSensitive\s*\(\s*gcode_move\s*,\s*"gcode_position"\s*\)/);
  assert.match(main, /TIMELAPSE_MIN_Z_DELTA_MM/);
  assert.match(main, /z_height_changed/);
  assert.match(main, /layer_source=%s/);
});

test("ESP32-S3 timelapse firmware does not use Z fallback before a known layer counter starts", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");

  assert.match(main, /has_layer_counter/);
  assert.match(main, /current_layer <= 0 && has_layer_counter/);
  assert.match(main, /waiting_for_positive_layer/);
  assert.ok(
    main.indexOf("current_layer <= 0 && has_layer_counter") < main.indexOf("z_height_changed"),
    "firmware must wait for positive layer before the Z fallback can trigger when total_layer is known"
  );
});

test("ESP32-S3 timelapse firmware prefers canonical macro events and falls back to the legacy alias", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const readme = readFileSync(firmwareReadmePath, "utf-8");

  assert.match(
    main,
    /TIMELAPSE_CANONICAL_MACRO_OBJECT_NAME\s+"gcode_macro ESP_TIMELAPSE_SHOT"/
  );
  assert.match(
    main,
    /TIMELAPSE_LEGACY_MACRO_OBJECT_NAME\s+"gcode_macro CYBERBRICK_SHOT"/
  );
  assert.match(
    main,
    /\/printer\/objects\/query\?gcode_macro%20ESP_TIMELAPSE_SHOT&gcode_macro%20CYBERBRICK_SHOT&print_stats&timelapse&virtual_sdcard&gcode_move&exception_manager&webhooks/
  );
  assert.match(main, /s_timelapse_baseline_macro/);
  assert.match(main, /s_timelapse_last_macro_seq/);
  assert.match(
    main,
    /cJSON_GetObjectItemCaseSensitive\s*\(\s*status\s*,\s*TIMELAPSE_CANONICAL_MACRO_OBJECT_NAME\s*\)/
  );
  assert.match(
    main,
    /cJSON_GetObjectItemCaseSensitive\s*\(\s*status\s*,\s*TIMELAPSE_LEGACY_MACRO_OBJECT_NAME\s*\)/
  );
  assert.match(main, /canonical_macro_seq_valid\s*\?\s*canonical_macro/);
  assert.match(main, /legacy_macro_seq_valid\s*\?\s*legacy_macro/);
  assert.match(main, /macro_source=canonical\|legacy\|none|timelapse_macro_source_name/);
  assert.match(main, /json_int_value\s*\(\s*macro\s*,\s*"seq"\s*,/);
  assert.match(main, /TIMELAPSE_MACRO_EVENT trigger_source=klipper_macro/);
  assert.match(main, /TIMELAPSE_TRIGGER_DONE trigger_source=%s/);
  assert.match(main, /timelapse_run_trigger_if_safe\s*\(\s*"klipper_macro"/);
  assert.match(main, /TIMELAPSE_LAYER_FALLBACK_SKIP reason=macro_object_present/);
  assert.ok(
    main.indexOf("timelapse_handle_macro_event(&event)") <
      main.indexOf("timelapse_handle_layer_event(&event)"),
    "macro seq events should be evaluated before layer fallback"
  );

  assert.match(readme, /ESP_TIMELAPSE_SHOT/);
  assert.match(readme, /CYBERBRICK_SHOT/);
  assert.match(readme, /兼容|compatib/i);
  assert.match(readme, /macro seq/);
  assert.match(readme, /层号.*fallback|fallback.*层号/);
});

test("ESP32-S3 timelapse firmware keeps layer fallback when both macro names have no valid seq", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");
  const readme = readFileSync(firmwareReadmePath, "utf-8");

  assert.match(main, /canonical_macro_seq_valid/);
  assert.match(main, /legacy_macro_seq_valid/);
  assert.match(main, /macro_present\s*=\s*macro_source\s*!=\s*TIMELAPSE_MACRO_SOURCE_NONE/);
  assert.match(main, /macro_seq_missing/);
  assert.match(readme, /seq.*无效.*层号 fallback|层号 fallback.*seq.*无效/);
});

test("ESP32-S3 timelapse firmware baselines a live macro source switch without shooting", () => {
  const main = readFileSync(firmwareMainPath, "utf-8");

  assert.match(main, /s_timelapse_last_macro_source/);
  assert.match(main, /source_changed/);
  assert.match(main, /macro_source_changed/);
  assert.ok(
    main.indexOf("macro_source_changed") < main.indexOf("macro_seq_changed"),
    "a source switch must establish a baseline before normal sequence changes can trigger"
  );
});
