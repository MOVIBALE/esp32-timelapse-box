#include <inttypes.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_event.h"
#include "esp_gap_ble_api.h"
#include "esp_gatt_common_api.h"
#include "esp_gattc_api.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"

#ifndef LIVE_SHUTTER_BLUEDROID_PROBE
#error "LIVE_SHUTTER_BLUEDROID_PROBE must be defined for this firmware."
#endif

#ifndef SHUTTER_TEST_USER_APPROVED
#error "SHUTTER_TEST_USER_APPROVED must be defined after explicit user approval."
#endif

#ifndef SERIAL_TRIGGER_REQUIRED
#error "SERIAL_TRIGGER_REQUIRED must be defined so this probe never shoots on boot."
#endif

#ifndef KLIPPER_SONY_TIMELAPSE_BOX
#error "KLIPPER_SONY_TIMELAPSE_BOX must be defined for the integrated Klipper/Sony firmware."
#endif

#ifndef TIMELAPSE_SERIAL_ARM_REQUIRED
#error "TIMELAPSE_SERIAL_ARM_REQUIRED must be defined so Klipper layer events stay safe after boot."
#endif

#ifndef TIMELAPSE_DRY_RUN_DEFAULT
#define TIMELAPSE_DRY_RUN_DEFAULT 1
#endif

#ifndef TIMELAPSE_WIFI_SSID
#define TIMELAPSE_WIFI_SSID ""
#endif

#ifndef TIMELAPSE_WIFI_PASSWORD
#define TIMELAPSE_WIFI_PASSWORD ""
#endif

#ifndef TIMELAPSE_MOONRAKER_HOST
#define TIMELAPSE_MOONRAKER_HOST "printer.local"
#endif

#ifndef TIMELAPSE_MOONRAKER_PORT
#define TIMELAPSE_MOONRAKER_PORT 7125
#endif

#ifndef TIMELAPSE_POLL_INTERVAL_MS
#define TIMELAPSE_POLL_INTERVAL_MS 500
#endif

#ifndef TIMELAPSE_MIN_TRIGGER_INTERVAL_MS
#define TIMELAPSE_MIN_TRIGGER_INTERVAL_MS 1000
#endif

#ifndef TIMELAPSE_STARTUP_DELAY_MS
#define TIMELAPSE_STARTUP_DELAY_MS 3000
#endif

#ifndef TIMELAPSE_MIN_Z_DELTA_MM
#define TIMELAPSE_MIN_Z_DELTA_MM 0.04
#endif

#define PROFILE_APP_ID 0
#define SONY_COMPANY_ID 0x012D
#define SONY_PAIRING_TAG 0x22
#define SCAN_SECONDS 30
#define SONY_REMOTE_COMMAND_UUID16 0xFF01
#define SONY_REMOTE_NOTIFY_UUID16 0xFF02
#define SONY_CLIENT_CONFIG_UUID16 0x2902
#define SONY_MAX_BOND_DEVICES 8
#define SONY_MAX_SERVICE_CHARS 16
#define INVALID_HANDLE 0
#define SONY_STATUS_ACTIVE 0x20
#define TIMELAPSE_CANONICAL_MACRO_OBJECT_NAME "gcode_macro ESP32_TIMELAPSE_SHOT"
#define TIMELAPSE_LEGACY_MACRO_OBJECT_NAME "gcode_macro CYBERBRICK_SHOT"
#define TIMELAPSE_STATUS_PATH "/printer/objects/query?gcode_macro%20ESP32_TIMELAPSE_SHOT&gcode_macro%20CYBERBRICK_SHOT&print_stats&timelapse&virtual_sdcard&gcode_move&exception_manager&webhooks"
#define TIMELAPSE_HTTP_RESPONSE_MAX 8192
#define TIMELAPSE_FILENAME_MAX 96
#define TIMELAPSE_SSID_MAX 33
#define TIMELAPSE_PASSWORD_MAX 65
#define TIMELAPSE_HOST_MAX 64
#define TIMELAPSE_NVS_NAMESPACE "timelapse"
#define TIMELAPSE_WIFI_MAX_RETRY 20
#define TIMELAPSE_WIFI_CONNECTED_BIT BIT0
#define TIMELAPSE_WIFI_FAIL_BIT BIT1

typedef enum {
    TIMELAPSE_MACRO_SOURCE_NONE = 0,
    TIMELAPSE_MACRO_SOURCE_CANONICAL,
    TIMELAPSE_MACRO_SOURCE_LEGACY,
} timelapse_macro_source_t;

static const char *timelapse_macro_source_name(timelapse_macro_source_t source)
{
    switch (source) {
    case TIMELAPSE_MACRO_SOURCE_CANONICAL:
        return "canonical";
    case TIMELAPSE_MACRO_SOURCE_LEGACY:
        return "legacy";
    default:
        return "none";
    }
}

static const char *TAG = "SONY_BLUEDROID_SHUT";
static const char *SONY_REMOTE_SERVICE_UUID_TEXT = "8000FF00-FF00-FFFF-FFFF-FFFFFFFFFFFF";

static const uint8_t SONY_REMOTE_SERVICE_UUID128_BE[ESP_UUID_LEN_128] = {
    0x80, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
};

static const uint8_t SONY_REMOTE_SERVICE_UUID128_LE[ESP_UUID_LEN_128] = {
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0x00, 0xFF, 0x00, 0xFF, 0x00, 0x80,
};

static const uint8_t SONY_COMMAND_UUID128_LE[ESP_UUID_LEN_128] = {
    0xFB, 0x34, 0x9B, 0x5F, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0x01, 0xFF, 0x00, 0x00,
};

static const uint8_t SONY_NOTIFY_UUID128_LE[ESP_UUID_LEN_128] = {
    0xFB, 0x34, 0x9B, 0x5F, 0x80, 0x00, 0x00, 0x80,
    0x00, 0x10, 0x00, 0x00, 0x02, 0xFF, 0x00, 0x00,
};

static const uint8_t COMMAND_FOCUS_DOWN[] = {0x01, 0x07};
static const uint8_t COMMAND_FULL_DOWN[] = {0x01, 0x09};
static const uint8_t COMMAND_HALF_UP[] = {0x01, 0x06};
static const uint8_t COMMAND_FULLY_UP[] = {0x01, 0x08};
static uint8_t COMMAND_ENABLE_NOTIFY[] = {0x01, 0x00};
static const char *LOG_WRITE_FOCUS_DOWN = "SONY_BLUEDROID_SHUTTER_WRITE focus_down bytes=0107";
static const char *LOG_WRITE_FULL_DOWN = "SONY_BLUEDROID_SHUTTER_WRITE full_down bytes=0109";
static const char *LOG_WRITE_FULLY_UP = "SONY_BLUEDROID_SHUTTER_WRITE fully_up bytes=0108";
static const char *LOG_WRITE_HALF_UP = "SONY_BLUEDROID_SHUTTER_WRITE half_up bytes=0106";

static esp_gatt_if_t s_gattc_if = ESP_GATT_IF_NONE;
static bool s_have_target = false;
static esp_bd_addr_t s_target_addr = {0};
static esp_ble_addr_type_t s_target_addr_type = BLE_ADDR_TYPE_PUBLIC;
static bool s_connecting = false;
static bool s_connected = false;
static bool s_sony_scan_requested = false;
static bool s_sony_scanning = false;
static bool s_pairing_requested = false;
static bool s_search_started = false;
static bool s_service_found = false;
static bool s_ready_for_serial_trigger = false;
static bool s_shutter_in_progress = false;
static bool s_sequence_completed = false;
static uint16_t s_conn_id = 0;
static uint16_t s_service_start_handle = 0;
static uint16_t s_service_end_handle = 0;
static bool s_command_found = false;
static bool s_notify_found = false;
static bool s_notify_registered = false;
static bool s_notify_subscribed = false;
static uint16_t s_command_handle = 0;
static uint16_t s_notify_handle = 0;
static uint16_t s_notify_cccd_handle = 0;
static uint8_t s_command_props = 0;
static uint8_t s_notify_props = 0;
static SemaphoreHandle_t s_write_done = NULL;
static SemaphoreHandle_t s_focus_acquired = NULL;
static SemaphoreHandle_t s_shutter_active = NULL;
static esp_gatt_status_t s_last_write_status = ESP_GATT_ERROR;
static volatile uint8_t s_focus_status = 0;
static volatile uint8_t s_shutter_status = 0;
static EventGroupHandle_t s_wifi_event_group = NULL;
static int s_wifi_retry_count = 0;
static bool s_wifi_started = false;
static bool s_wifi_connected = false;
static bool s_timelapse_enabled = true;
static bool s_timelapse_dry_run = TIMELAPSE_DRY_RUN_DEFAULT;
static bool s_timelapse_live_armed = false;
static bool s_timelapse_baseline_macro = false;
static bool s_timelapse_baseline_layer = false;
static bool s_timelapse_baseline_z = false;
static int s_timelapse_last_macro_seq = -1;
static timelapse_macro_source_t s_timelapse_last_macro_source = TIMELAPSE_MACRO_SOURCE_NONE;
static int s_timelapse_last_layer = -1;
static double s_timelapse_last_z_mm = -1.0;
static int64_t s_timelapse_last_trigger_ms = 0;
static char s_timelapse_wifi_ssid[TIMELAPSE_SSID_MAX] = TIMELAPSE_WIFI_SSID;
static char s_timelapse_wifi_password[TIMELAPSE_PASSWORD_MAX] = TIMELAPSE_WIFI_PASSWORD;
static char s_timelapse_moonraker_host[TIMELAPSE_HOST_MAX] = TIMELAPSE_MOONRAKER_HOST;
static char s_timelapse_last_filename[TIMELAPSE_FILENAME_MAX] = {0};
static const uint32_t min_trigger_interval_ms = TIMELAPSE_MIN_TRIGGER_INTERVAL_MS;

typedef struct {
    char *body;
    int length;
    int capacity;
} timelapse_http_capture_t;

typedef struct {
    bool should_trigger;
    bool macro_present;
    bool macro_should_trigger;
    bool baseline_macro;
    bool baseline_layer;
    bool has_z_height;
    timelapse_macro_source_t macro_source;
    int macro_seq;
    int current_layer;
    int total_layer;
    double z_height_mm;
    char filename[TIMELAPSE_FILENAME_MAX];
    char reason[48];
    char macro_reason[48];
    char layer_source[24];
} timelapse_layer_event_t;

static bool run_trigger_once_sequence(void);
static void timelapse_wifi_init_sta(void);
static bool timelapse_save_network_config(const char *ssid, const char *password, const char *host);
static bool sony_ble_is_busy(void);
static bool start_sony_pairing_scan(const char *source);
static bool start_bonded_sony_scan(const char *source);

static esp_ble_scan_params_t s_scan_params = {
    .scan_type = BLE_SCAN_TYPE_PASSIVE,
    .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
    .scan_filter_policy = BLE_SCAN_FILTER_ALLOW_ALL,
    .scan_interval = ESP_BLE_GAP_SCAN_ITVL_MS(160),
    .scan_window = ESP_BLE_GAP_SCAN_WIN_MS(30),
    .scan_duplicate = BLE_SCAN_DUPLICATE_DISABLE,
};

static esp_ble_scan_params_t s_pairing_scan_params = {
    .scan_type = BLE_SCAN_TYPE_ACTIVE,
    .own_addr_type = BLE_ADDR_TYPE_PUBLIC,
    .scan_filter_policy = BLE_SCAN_FILTER_ALLOW_ALL,
    .scan_interval = ESP_BLE_GAP_SCAN_ITVL_MS(60),
    .scan_window = ESP_BLE_GAP_SCAN_WIN_MS(40),
    .scan_duplicate = BLE_SCAN_DUPLICATE_DISABLE,
};

static void print_hex_compact(const uint8_t *data, uint8_t length)
{
    for (uint8_t index = 0; index < length; index++) {
        printf("%02X", data[index]);
    }
}

static bool bd_addr_equal(const esp_bd_addr_t left, const esp_bd_addr_t right)
{
    return memcmp(left, right, ESP_BD_ADDR_LEN) == 0;
}

static bool parse_sony_manufacturer(const uint8_t *data, uint8_t length, bool *pairing_open, bool *remote_enabled)
{
    *pairing_open = false;
    *remote_enabled = false;
    if (length < 4) {
        return false;
    }

    const uint16_t company_id = ((uint16_t)data[1] << 8) | data[0];
    if (company_id != SONY_COMPANY_ID || data[2] != 0x03 || data[3] != 0x00) {
        return false;
    }

    for (uint8_t index = 0; index + 1 < length; index++) {
        if (data[index] == SONY_PAIRING_TAG) {
            const uint8_t status = data[index + 1];
            *pairing_open = (status & 0x40) == 0x40;
            *remote_enabled = (status & 0x02) == 0x02;
            return true;
        }
    }

    return true;
}

static bool uuid_is_sony_remote_service(const esp_bt_uuid_t *uuid)
{
    return uuid->len == ESP_UUID_LEN_128 &&
           (memcmp(uuid->uuid.uuid128, SONY_REMOTE_SERVICE_UUID128_LE, ESP_UUID_LEN_128) == 0 ||
            memcmp(uuid->uuid.uuid128, SONY_REMOTE_SERVICE_UUID128_BE, ESP_UUID_LEN_128) == 0);
}

static bool uuid_is_sony_char(const esp_bt_uuid_t *uuid, uint16_t uuid16)
{
    const uint8_t *uuid128 = uuid16 == SONY_REMOTE_COMMAND_UUID16 ? SONY_COMMAND_UUID128_LE : SONY_NOTIFY_UUID128_LE;
    return (uuid->len == ESP_UUID_LEN_16 && uuid->uuid.uuid16 == uuid16) ||
           (uuid->len == ESP_UUID_LEN_128 && memcmp(uuid->uuid.uuid128, uuid128, ESP_UUID_LEN_128) == 0);
}

static void uuid_to_text(const esp_bt_uuid_t *uuid, char *buffer, size_t buffer_len)
{
    if (uuid->len == ESP_UUID_LEN_16) {
        snprintf(buffer, buffer_len, "0000%04X-0000-1000-8000-00805F9B34FB", uuid->uuid.uuid16);
    } else if (uuid->len == ESP_UUID_LEN_32) {
        snprintf(buffer, buffer_len, "%08" PRIX32 "-0000-1000-8000-00805F9B34FB", uuid->uuid.uuid32);
    } else if (uuid->len == ESP_UUID_LEN_128) {
        const uint8_t *u = uuid->uuid.uuid128;
        snprintf(buffer, buffer_len,
                 "%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
                 u[15], u[14], u[13], u[12], u[11], u[10], u[9], u[8],
                 u[7], u[6], u[5], u[4], u[3], u[2], u[1], u[0]);
    } else {
        snprintf(buffer, buffer_len, "unknown-len-%u", uuid->len);
    }
}

static void log_bonded_devices(void)
{
    const int bond_count = esp_ble_get_bond_device_num();
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_BOND_LIST count=%d", bond_count);
    if (bond_count <= 0) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_NO_BOND");
        return;
    }

    esp_ble_bond_dev_t bond_devices[SONY_MAX_BOND_DEVICES] = {0};
    int list_count = bond_count < SONY_MAX_BOND_DEVICES ? bond_count : SONY_MAX_BOND_DEVICES;
    const esp_err_t ret = esp_ble_get_bond_device_list(&list_count, bond_devices);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_BOND_LIST_ERROR err=%s", esp_err_to_name(ret));
        return;
    }

    for (int index = 0; index < list_count; index++) {
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_BOND_DEVICE index=%d addr=" ESP_BD_ADDR_STR " addr_type=%u",
                 index,
                 ESP_BD_ADDR_HEX(bond_devices[index].bd_addr),
                 bond_devices[index].bd_addr_type);
    }

    if (!s_have_target) {
        memcpy(s_target_addr, bond_devices[0].bd_addr, ESP_BD_ADDR_LEN);
        s_target_addr_type = bond_devices[0].bd_addr_type;
        s_have_target = true;
    }
}

static void print_status(void)
{
    ESP_LOGI(TAG,
             "SONY_BLUEDROID_SHUTTER_STATUS target=%s bond_count=%d pairing=%s connecting=%s connected=%s service_found=%s ready=%s command_ff01=%s notify_ff02=%s notify_subscribed=%s focus_status=0x%02x shutter_status=0x%02x sequence_completed=%s",
             s_have_target ? "true" : "false",
             esp_ble_get_bond_device_num(),
             s_pairing_requested ? "true" : "false",
             s_connecting ? "true" : "false",
             s_connected ? "true" : "false",
             s_service_found ? "true" : "false",
             s_ready_for_serial_trigger ? "true" : "false",
             s_command_found ? "true" : "false",
             s_notify_found ? "true" : "false",
             s_notify_subscribed ? "true" : "false",
             s_focus_status,
             s_shutter_status,
             s_sequence_completed ? "true" : "false");
}

static void print_timelapse_status(void)
{
    ESP_LOGI(TAG,
             "TIMELAPSE_STATUS enabled=%s dry_run=%s armed=%s wifi_connected=%s moonraker_host=%s moonraker_port=%d poll_interval_ms=%d min_trigger_interval_ms=%" PRIu32 " macro_source=%s macro_seq=%d baseline_macro=%s last_layer=%d filename=%s baseline_layer=%s trigger_source=auto_macro_or_klipper_layer",
             s_timelapse_enabled ? "true" : "false",
             s_timelapse_dry_run ? "true" : "false",
             s_timelapse_live_armed ? "true" : "false",
             s_wifi_connected ? "true" : "false",
             s_timelapse_moonraker_host,
             TIMELAPSE_MOONRAKER_PORT,
             TIMELAPSE_POLL_INTERVAL_MS,
             min_trigger_interval_ms,
             timelapse_macro_source_name(s_timelapse_last_macro_source),
             s_timelapse_last_macro_seq,
             s_timelapse_baseline_macro ? "true" : "false",
             s_timelapse_last_layer,
             s_timelapse_last_filename[0] == '\0' ? "-" : s_timelapse_last_filename,
             s_timelapse_baseline_layer ? "true" : "false");
}

static bool json_bool_value(cJSON *object, const char *key, bool default_value)
{
    if (!cJSON_IsObject(object)) {
        return default_value;
    }
    cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
    if (cJSON_IsBool(item)) {
        return cJSON_IsTrue(item);
    }
    return default_value;
}

static int json_int_value(cJSON *object, const char *key, int default_value)
{
    if (!cJSON_IsObject(object)) {
        return default_value;
    }
    cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
    if (cJSON_IsNumber(item)) {
        return item->valueint;
    }
    return default_value;
}

static const char *json_string_value(cJSON *object, const char *key, const char *default_value)
{
    if (!cJSON_IsObject(object)) {
        return default_value;
    }
    cJSON *item = cJSON_GetObjectItemCaseSensitive(object, key);
    if (cJSON_IsString(item) && item->valuestring != NULL) {
        return item->valuestring;
    }
    return default_value;
}

static bool json_array_number_at(cJSON *array, int index, double *value)
{
    if (!cJSON_IsArray(array) || value == NULL) {
        return false;
    }
    cJSON *item = cJSON_GetArrayItem(array, index);
    if (!cJSON_IsNumber(item)) {
        return false;
    }
    *value = item->valuedouble;
    return true;
}

static cJSON *moonraker_status_object(cJSON *root)
{
    cJSON *result = cJSON_GetObjectItemCaseSensitive(root, "result");
    if (!cJSON_IsObject(result)) {
        return NULL;
    }
    cJSON *status = cJSON_GetObjectItemCaseSensitive(result, "status");
    return cJSON_IsObject(status) ? status : NULL;
}

static bool status_has_active_exceptions(cJSON *exception_manager)
{
    cJSON *exceptions = cJSON_GetObjectItemCaseSensitive(exception_manager, "exceptions");
    return cJSON_IsArray(exceptions) && cJSON_GetArraySize(exceptions) > 0;
}

static void timelapse_reset_layer_baseline(void)
{
    s_timelapse_baseline_macro = false;
    s_timelapse_baseline_layer = false;
    s_timelapse_baseline_z = false;
    s_timelapse_last_macro_seq = -1;
    s_timelapse_last_macro_source = TIMELAPSE_MACRO_SOURCE_NONE;
    s_timelapse_last_layer = -1;
    s_timelapse_last_z_mm = -1.0;
    s_timelapse_last_filename[0] = '\0';
}

static bool timelapse_parse_layer_event(const char *json_body, timelapse_layer_event_t *event)
{
    memset(event, 0, sizeof(*event));
    snprintf(event->reason, sizeof(event->reason), "unknown");
    snprintf(event->macro_reason, sizeof(event->macro_reason), "macro_absent");

    cJSON *root = cJSON_Parse(json_body);
    if (root == NULL) {
        snprintf(event->reason, sizeof(event->reason), "json_parse_error");
        ESP_LOGW(TAG, "TIMELAPSE_MOONRAKER_PARSE_ERROR reason=json_parse_error");
        return false;
    }

    cJSON *status = moonraker_status_object(root);
    cJSON *print_stats = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "print_stats") : NULL;
    cJSON *timelapse = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "timelapse") : NULL;
    cJSON *virtual_sdcard = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "virtual_sdcard") : NULL;
    cJSON *gcode_move = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "gcode_move") : NULL;
    cJSON *exception_manager = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "exception_manager") : NULL;
    cJSON *webhooks = status != NULL ? cJSON_GetObjectItemCaseSensitive(status, "webhooks") : NULL;
    cJSON *canonical_macro = status != NULL ?
        cJSON_GetObjectItemCaseSensitive(status, TIMELAPSE_CANONICAL_MACRO_OBJECT_NAME) : NULL;
    cJSON *legacy_macro = status != NULL ?
        cJSON_GetObjectItemCaseSensitive(status, TIMELAPSE_LEGACY_MACRO_OBJECT_NAME) : NULL;

    if (!cJSON_IsObject(status) || !cJSON_IsObject(print_stats) || !cJSON_IsObject(timelapse)) {
        snprintf(event->reason, sizeof(event->reason), "missing_status");
        cJSON_Delete(root);
        return false;
    }

    const char *print_state = json_string_value(print_stats, "state", "");
    const char *filename = json_string_value(print_stats, "filename", "");
    const char *webhooks_state = cJSON_IsObject(webhooks) ? json_string_value(webhooks, "state", "ready") : "ready";
    cJSON *print_stats_info = cJSON_GetObjectItemCaseSensitive(print_stats, "info");
    if (!cJSON_IsObject(print_stats_info)) {
        print_stats_info = NULL;
    }
    const int timelapse_current_layer = json_int_value(timelapse, "current_layer", 0);
    const int timelapse_total_layer = json_int_value(timelapse, "total_layer", 0);
    const int print_stats_current_layer = json_int_value(print_stats_info, "current_layer", 0);
    const int print_stats_total_layer = json_int_value(print_stats_info, "total_layer", 0);
    const int current_layer = print_stats_current_layer > 0 ? print_stats_current_layer : timelapse_current_layer;
    const int total_layer = print_stats_total_layer > 0 ? print_stats_total_layer : timelapse_total_layer;
    const bool has_layer_counter = current_layer > 0 || total_layer > 0;
    const bool canonical_macro_object_seen = cJSON_IsObject(canonical_macro);
    const bool legacy_macro_object_seen = cJSON_IsObject(legacy_macro);
    const int canonical_macro_seq = json_int_value(canonical_macro, "seq", -1);
    const int legacy_macro_seq = json_int_value(legacy_macro, "seq", -1);
    const bool canonical_macro_seq_valid = canonical_macro_object_seen && canonical_macro_seq >= 0;
    const bool legacy_macro_seq_valid = legacy_macro_object_seen && legacy_macro_seq >= 0;
    cJSON *macro = canonical_macro_seq_valid ? canonical_macro :
        (legacy_macro_seq_valid ? legacy_macro : NULL);
    const timelapse_macro_source_t macro_source = canonical_macro_seq_valid ?
        TIMELAPSE_MACRO_SOURCE_CANONICAL :
        (legacy_macro_seq_valid ? TIMELAPSE_MACRO_SOURCE_LEGACY : TIMELAPSE_MACRO_SOURCE_NONE);
    const bool macro_object_seen = canonical_macro_object_seen || legacy_macro_object_seen;
    const int macro_seq = json_int_value(macro, "seq", -1);
    const bool macro_present = macro_source != TIMELAPSE_MACRO_SOURCE_NONE;
    cJSON *gcode_position = cJSON_IsObject(gcode_move) ?
        cJSON_GetObjectItemCaseSensitive(gcode_move, "gcode_position") : NULL;
    double z_height_mm = 0.0;
    const bool has_z_height = json_array_number_at(gcode_position, 2, &z_height_mm);
    const char *layer_source = print_stats_current_layer > 0 ? "print_stats_info" :
        (timelapse_current_layer > 0 ? "timelapse" : (has_z_height ? "gcode_move_z" : "none"));
    const bool timelapse_active = json_bool_value(timelapse, "is_active", false);
    const bool virtual_sdcard_active = cJSON_IsObject(virtual_sdcard) ?
        json_bool_value(virtual_sdcard, "is_active", false) : false;
    const bool has_exceptions = cJSON_IsObject(exception_manager) && status_has_active_exceptions(exception_manager);

    event->macro_present = macro_present;
    event->macro_source = macro_source;
    event->macro_seq = macro_seq;
    event->current_layer = current_layer;
    event->total_layer = total_layer;
    event->has_z_height = has_z_height;
    event->z_height_mm = z_height_mm;
    snprintf(event->layer_source, sizeof(event->layer_source), "%s", layer_source);
    snprintf(event->filename, sizeof(event->filename), "%s", filename);

    ESP_LOGI(TAG,
             "TIMELAPSE_MOONRAKER_STATUS print_state=%s timelapse_active=%s virtual_sdcard_active=%s webhooks_state=%s exceptions=%s macro_object_seen=%s canonical_macro_seen=%s legacy_macro_seen=%s macro_present=%s macro_source=%s macro_seq=%d current_layer=%d total_layer=%d layer_source=%s z_mm=%.3f has_z=%s filename=%s",
             print_state,
             timelapse_active ? "true" : "false",
             virtual_sdcard_active ? "true" : "false",
             webhooks_state,
             has_exceptions ? "true" : "false",
             macro_object_seen ? "true" : "false",
             canonical_macro_object_seen ? "true" : "false",
             legacy_macro_object_seen ? "true" : "false",
             macro_present ? "true" : "false",
             timelapse_macro_source_name(macro_source),
             macro_seq,
             current_layer,
             total_layer,
             event->layer_source,
             z_height_mm,
             has_z_height ? "true" : "false",
             filename[0] == '\0' ? "-" : filename);

    const bool common_safe = strcmp(print_state, "printing") == 0 && virtual_sdcard_active &&
        strcmp(webhooks_state, "ready") == 0 && !has_exceptions;
    if (!common_safe || (!timelapse_active && !macro_present)) {
        snprintf(event->reason, sizeof(event->reason), "not_safe_or_not_printing");
        snprintf(event->macro_reason, sizeof(event->macro_reason), "not_safe_or_not_printing");
        timelapse_reset_layer_baseline();
        cJSON_Delete(root);
        return true;
    }

    if (strncmp(s_timelapse_last_filename, filename, sizeof(s_timelapse_last_filename)) != 0) {
        s_timelapse_baseline_macro = false;
        s_timelapse_baseline_layer = false;
        s_timelapse_baseline_z = false;
        s_timelapse_last_macro_seq = -1;
        s_timelapse_last_macro_source = TIMELAPSE_MACRO_SOURCE_NONE;
        s_timelapse_last_layer = -1;
        s_timelapse_last_z_mm = -1.0;
        snprintf(s_timelapse_last_filename, sizeof(s_timelapse_last_filename), "%s", filename);
    }

    if (macro_present) {
        const bool source_changed = s_timelapse_baseline_macro &&
            s_timelapse_last_macro_source != macro_source;
        if (!s_timelapse_baseline_macro || source_changed) {
            s_timelapse_baseline_macro = true;
            s_timelapse_last_macro_seq = macro_seq;
            s_timelapse_last_macro_source = macro_source;
            event->baseline_macro = true;
            snprintf(event->macro_reason, sizeof(event->macro_reason),
                     source_changed ? "macro_source_changed" : "baseline_macro_seq");
            cJSON_Delete(root);
            return true;
        }

        if (macro_seq <= s_timelapse_last_macro_seq) {
            snprintf(event->macro_reason, sizeof(event->macro_reason),
                     macro_seq < s_timelapse_last_macro_seq ? "macro_seq_rewound" : "same_macro_seq");
            s_timelapse_last_macro_seq = macro_seq;
            cJSON_Delete(root);
            return true;
        }

        const int64_t now_ms = esp_timer_get_time() / 1000;
        if (s_timelapse_last_trigger_ms > 0 && now_ms - s_timelapse_last_trigger_ms < min_trigger_interval_ms) {
            snprintf(event->macro_reason, sizeof(event->macro_reason), "min_trigger_interval_ms");
            s_timelapse_last_macro_seq = macro_seq;
            cJSON_Delete(root);
            return true;
        }

        s_timelapse_last_macro_seq = macro_seq;
        s_timelapse_last_trigger_ms = now_ms;
        event->macro_should_trigger = true;
        snprintf(event->macro_reason, sizeof(event->macro_reason), "macro_seq_changed");
        cJSON_Delete(root);
        return true;
    }

    if (s_timelapse_baseline_macro) {
        s_timelapse_baseline_macro = false;
        s_timelapse_last_macro_seq = -1;
        s_timelapse_last_macro_source = TIMELAPSE_MACRO_SOURCE_NONE;
    }

    if (macro_object_seen && !macro_present) {
        snprintf(event->macro_reason, sizeof(event->macro_reason), "macro_seq_missing");
    }

    if (current_layer > 0) {
        if (!s_timelapse_baseline_layer) {
            s_timelapse_baseline_layer = true;
            s_timelapse_last_layer = current_layer;
            event->baseline_layer = true;
            snprintf(event->reason, sizeof(event->reason), "baseline_layer");
            cJSON_Delete(root);
            return true;
        }

        if (current_layer <= s_timelapse_last_layer) {
            snprintf(event->reason, sizeof(event->reason), "same_or_rewound_layer");
            cJSON_Delete(root);
            return true;
        }

        const int64_t now_ms = esp_timer_get_time() / 1000;
        if (s_timelapse_last_trigger_ms > 0 && now_ms - s_timelapse_last_trigger_ms < min_trigger_interval_ms) {
            snprintf(event->reason, sizeof(event->reason), "min_trigger_interval_ms");
            s_timelapse_last_layer = current_layer;
            cJSON_Delete(root);
            return true;
        }

        s_timelapse_last_layer = current_layer;
        s_timelapse_last_trigger_ms = now_ms;
        event->should_trigger = true;
        snprintf(event->reason, sizeof(event->reason), "layer_changed");
        cJSON_Delete(root);
        return true;
    }

    if (current_layer <= 0 && has_layer_counter) {
        snprintf(event->reason, sizeof(event->reason), "waiting_for_positive_layer");
        cJSON_Delete(root);
        return true;
    }

    if (!has_z_height || z_height_mm <= 0.0) {
        snprintf(event->reason, sizeof(event->reason), "waiting_for_positive_layer");
        cJSON_Delete(root);
        return true;
    }

    snprintf(event->layer_source, sizeof(event->layer_source), "gcode_move_z");
    if (!s_timelapse_baseline_z) {
        s_timelapse_baseline_z = true;
        s_timelapse_last_z_mm = z_height_mm;
        event->baseline_layer = true;
        snprintf(event->reason, sizeof(event->reason), "baseline_z_height");
        cJSON_Delete(root);
        return true;
    }

    if (z_height_mm < s_timelapse_last_z_mm) {
        s_timelapse_last_z_mm = z_height_mm;
        snprintf(event->reason, sizeof(event->reason), "z_rewound");
        cJSON_Delete(root);
        return true;
    }

    if (z_height_mm - s_timelapse_last_z_mm < TIMELAPSE_MIN_Z_DELTA_MM) {
        snprintf(event->reason, sizeof(event->reason), "same_or_small_z_delta");
        cJSON_Delete(root);
        return true;
    }

    const int64_t now_ms = esp_timer_get_time() / 1000;
    if (s_timelapse_last_trigger_ms > 0 && now_ms - s_timelapse_last_trigger_ms < min_trigger_interval_ms) {
        snprintf(event->reason, sizeof(event->reason), "min_trigger_interval_ms");
        s_timelapse_last_z_mm = z_height_mm;
        cJSON_Delete(root);
        return true;
    }

    s_timelapse_last_z_mm = z_height_mm;
    s_timelapse_last_trigger_ms = now_ms;
    event->should_trigger = true;
    snprintf(event->reason, sizeof(event->reason), "z_height_changed");
    cJSON_Delete(root);
    return true;
}

static void timelapse_run_trigger_if_safe(const char *trigger_source, int layer, int macro_seq)
{
    if (s_timelapse_dry_run || !s_timelapse_live_armed) {
        ESP_LOGI(TAG,
                 "TIMELAPSE_TRIGGER_SKIP reason=dry_run_or_not_armed trigger_source=%s layer=%d macro_seq=%d dry_run=%s armed=%s",
                 trigger_source,
                 layer,
                 macro_seq,
                 s_timelapse_dry_run ? "true" : "false",
                 s_timelapse_live_armed ? "true" : "false");
        return;
    }

    if (!s_ready_for_serial_trigger || !s_connected || s_command_handle == 0) {
        ESP_LOGW(TAG,
                 "TIMELAPSE_TRIGGER_SKIP reason=sony_not_ready trigger_source=%s layer=%d macro_seq=%d connected=%s ready=%s command_handle=%u",
                 trigger_source,
                 layer,
                 macro_seq,
                 s_connected ? "true" : "false",
                 s_ready_for_serial_trigger ? "true" : "false",
                 s_command_handle);
        return;
    }

    const bool ok = run_trigger_once_sequence();
    ESP_LOGI(TAG,
             "TIMELAPSE_TRIGGER_DONE trigger_source=%s layer=%d macro_seq=%d ok=%s",
             trigger_source,
             layer,
             macro_seq,
             ok ? "true" : "false");
}

static bool timelapse_handle_macro_event(const timelapse_layer_event_t *event)
{
    if (!event->macro_present) {
        return false;
    }

    if (!event->macro_should_trigger) {
        ESP_LOGI(TAG,
                 "TIMELAPSE_MACRO_EVENT trigger_source=klipper_macro action=observe reason=%s baseline_macro=%s macro_source=%s macro_seq=%d layer=%d filename=%s",
                 event->macro_reason,
                 event->baseline_macro ? "true" : "false",
                 timelapse_macro_source_name(event->macro_source),
                 event->macro_seq,
                 event->current_layer,
                 event->filename[0] == '\0' ? "-" : event->filename);
        return true;
    }

    ESP_LOGI(TAG,
             "TIMELAPSE_MACRO_EVENT trigger_source=klipper_macro action=trigger reason=%s macro_source=%s macro_seq=%d layer=%d filename=%s dry_run=%s armed=%s sony_ready=%s",
             event->macro_reason,
             timelapse_macro_source_name(event->macro_source),
             event->macro_seq,
             event->current_layer,
             event->filename[0] == '\0' ? "-" : event->filename,
             s_timelapse_dry_run ? "true" : "false",
             s_timelapse_live_armed ? "true" : "false",
             s_ready_for_serial_trigger ? "true" : "false");
    timelapse_run_trigger_if_safe("klipper_macro", event->current_layer, event->macro_seq);
    return true;
}

static void timelapse_handle_layer_event(const timelapse_layer_event_t *event)
{
    if (event->macro_present) {
        ESP_LOGI(TAG,
                 "TIMELAPSE_LAYER_FALLBACK_SKIP reason=macro_object_present macro_source=%s macro_seq=%d layer=%d",
                 timelapse_macro_source_name(event->macro_source),
                 event->macro_seq,
                 event->current_layer);
        return;
    }

    if (!event->should_trigger) {
        ESP_LOGI(TAG,
                 "TIMELAPSE_LAYER_EVENT trigger_source=klipper_layer action=observe reason=%s baseline_layer=%s layer=%d total_layer=%d layer_source=%s z_mm=%.3f",
                 event->reason,
                 event->baseline_layer ? "true" : "false",
                 event->current_layer,
                 event->total_layer,
                 event->layer_source,
                 event->z_height_mm);
        return;
    }

    ESP_LOGI(TAG,
             "TIMELAPSE_LAYER_EVENT trigger_source=klipper_layer action=trigger reason=%s layer=%d total_layer=%d layer_source=%s z_mm=%.3f filename=%s dry_run=%s armed=%s sony_ready=%s",
             event->reason,
             event->current_layer,
             event->total_layer,
             event->layer_source,
             event->z_height_mm,
             event->filename[0] == '\0' ? "-" : event->filename,
             s_timelapse_dry_run ? "true" : "false",
             s_timelapse_live_armed ? "true" : "false",
             s_ready_for_serial_trigger ? "true" : "false");
    timelapse_run_trigger_if_safe("klipper_layer", event->current_layer, -1);
}

static void clear_status_semaphores(void)
{
    if (s_focus_acquired != NULL) {
        while (xSemaphoreTake(s_focus_acquired, 0) == pdTRUE) {
        }
    }
    if (s_shutter_active != NULL) {
        while (xSemaphoreTake(s_shutter_active, 0) == pdTRUE) {
        }
    }
}

static bool wait_for_signal(SemaphoreHandle_t semaphore, const char *log_prefix, uint32_t timeout_ms, volatile uint8_t *status)
{
    ESP_LOGI(TAG, "%s start=true timeout_ms=%" PRIu32, log_prefix, timeout_ms);
    const bool ok = semaphore != NULL && xSemaphoreTake(semaphore, pdMS_TO_TICKS(timeout_ms)) == pdTRUE;
    ESP_LOGI(TAG, "%s result=%s status=0x%02x", log_prefix, ok ? "true" : "false", status != NULL ? *status : 0);
    return ok;
}

static bool write_ff01_command(const char *log_prefix, const char *label, const uint8_t *bytes, uint16_t length)
{
    if (!s_ready_for_serial_trigger || !s_connected || s_command_handle == 0 || s_gattc_if == ESP_GATT_IF_NONE) {
        ESP_LOGW(TAG, "%s submit=false reason=not_ready", log_prefix);
        return false;
    }

    while (xSemaphoreTake(s_write_done, 0) == pdTRUE) {
    }
    s_last_write_status = ESP_GATT_ERROR;

    const esp_err_t ret = esp_ble_gattc_write_char(
        s_gattc_if,
        s_conn_id,
        s_command_handle,
        length,
        (uint8_t *)bytes,
        ESP_GATT_WRITE_TYPE_RSP,
        ESP_GATT_AUTH_REQ_NONE
    );

    ESP_LOGI(TAG, "%s submit=%s err=%s", log_prefix, ret == ESP_OK ? "true" : "false", esp_err_to_name(ret));
    if (ret != ESP_OK) {
        return false;
    }

    const bool acked = xSemaphoreTake(s_write_done, pdMS_TO_TICKS(1500)) == pdTRUE;
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_WRITE_ACK %s ack=%s status=0x%x",
             label, acked ? "true" : "false", acked ? s_last_write_status : ESP_GATT_ERROR);
    return acked && s_last_write_status == ESP_GATT_OK;
}

static bool release_shutter_buttons(void)
{
    bool ok = true;
    ok = write_ff01_command(LOG_WRITE_FULLY_UP, "fully_up", COMMAND_FULLY_UP, sizeof(COMMAND_FULLY_UP)) && ok;
    vTaskDelay(pdMS_TO_TICKS(20));
    ok = write_ff01_command(LOG_WRITE_HALF_UP, "half_up", COMMAND_HALF_UP, sizeof(COMMAND_HALF_UP)) && ok;
    return ok;
}

static bool run_trigger_once_sequence(void)
{
    if (s_shutter_in_progress) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SEQUENCE_SKIP reason=in_progress");
        return false;
    }

    s_shutter_in_progress = true;
    clear_status_semaphores();
    s_focus_status = 0;
    s_shutter_status = 0;
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SEQUENCE_START profile=trigger_once count=1");
    bool ok = true;
    ok = write_ff01_command(LOG_WRITE_FOCUS_DOWN, "focus_down", COMMAND_FOCUS_DOWN, sizeof(COMMAND_FOCUS_DOWN)) && ok;
    vTaskDelay(pdMS_TO_TICKS(80));
    ok = write_ff01_command(LOG_WRITE_FULL_DOWN, "full_down", COMMAND_FULL_DOWN, sizeof(COMMAND_FULL_DOWN)) && ok;
    const bool saw_shutter = wait_for_signal(
        s_shutter_active,
        "SONY_BLUEDROID_SHUTTER_WAIT_SHUTTER_ACTIVE",
        3000,
        &s_shutter_status
    );
    ok = release_shutter_buttons() && ok;
    s_sequence_completed = ok && saw_shutter;
    s_shutter_in_progress = false;
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SEQUENCE_DONE ok=%s shutter_seen=%s",
             s_sequence_completed ? "true" : "false", saw_shutter ? "true" : "false");
    return s_sequence_completed;
}

static bool read_serial_line(char *buffer, size_t buffer_len, uint32_t timeout_ms)
{
    if (buffer_len == 0) {
        return false;
    }

    size_t length = 0;
    const int64_t deadline_ms = (esp_timer_get_time() / 1000) + timeout_ms;
    while ((esp_timer_get_time() / 1000) < deadline_ms && length + 1 < buffer_len) {
        const int ch = getchar();
        if (ch == EOF) {
            vTaskDelay(pdMS_TO_TICKS(10));
            continue;
        }
        if (ch == '\r') {
            continue;
        }
        if (ch == '\n') {
            break;
        }
        buffer[length++] = (char)ch;
    }
    buffer[length] = '\0';
    return length > 0;
}

static char *trim_left(char *text)
{
    while (*text == ' ' || *text == '\t') {
        text++;
    }
    return text;
}

static void trim_right(char *text)
{
    size_t length = strlen(text);
    while (length > 0 && (text[length - 1] == ' ' || text[length - 1] == '\t')) {
        text[length - 1] = '\0';
        length--;
    }
}

static bool parse_network_payload(char *payload, char **ssid, char **password, char **host)
{
    char *first_sep = strchr(payload, '|');
    if (first_sep == NULL) {
        return false;
    }
    *first_sep = '\0';

    char *second_sep = strchr(first_sep + 1, '|');
    if (second_sep == NULL) {
        return false;
    }
    *second_sep = '\0';

    *ssid = trim_left(payload);
    *password = trim_left(first_sep + 1);
    *host = trim_left(second_sep + 1);
    trim_right(*ssid);
    trim_right(*password);
    trim_right(*host);
    return (*ssid)[0] != '\0' && (*host)[0] != '\0';
}

static bool sony_ble_is_busy(void)
{
    return s_sony_scan_requested || s_sony_scanning || s_connecting ||
           s_pairing_requested || (s_connected && !s_ready_for_serial_trigger);
}

static bool start_sony_pairing_scan(const char *source)
{
    s_timelapse_live_armed = false;
    s_timelapse_dry_run = true;

    if (s_gattc_if == ESP_GATT_IF_NONE) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_REQUEST source=%s accepted=false reason=gattc_not_ready", source);
        return false;
    }
    if (s_connected || sony_ble_is_busy()) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_REQUEST source=%s accepted=false reason=busy", source);
        return false;
    }

    s_pairing_requested = true;
    s_sony_scan_requested = true;
    const esp_err_t ret = esp_ble_gap_set_scan_params(&s_pairing_scan_params);
    if (ret != ESP_OK) {
        s_pairing_requested = false;
        s_sony_scan_requested = false;
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_REQUEST source=%s accepted=false err=%s", source, esp_err_to_name(ret));
        return false;
    }

    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_REQUEST source=%s accepted=true dry_run=true armed=false no_ff01_writes=true", source);
    return true;
}

static bool start_bonded_sony_scan(const char *source)
{
    if (s_connected && s_ready_for_serial_trigger) {
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=true reason=already_ready", source);
        return true;
    }
    if (!s_have_target) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=false reason=no_bonded_target", source);
        return false;
    }
    if (s_gattc_if == ESP_GATT_IF_NONE) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=false reason=gattc_not_ready", source);
        return false;
    }
    if (sony_ble_is_busy()) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=false reason=busy", source);
        return false;
    }

    s_pairing_requested = false;
    s_sony_scan_requested = true;
    const esp_err_t ret = esp_ble_gap_set_scan_params(&s_scan_params);
    if (ret != ESP_OK) {
        s_sony_scan_requested = false;
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=false err=%s", source, esp_err_to_name(ret));
        return false;
    }

    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_REQUEST source=%s accepted=true", source);
    return true;
}

static void serial_command_task(void *arg)
{
    (void)arg;
    while (true) {
        const int command = getchar();
        if (command == EOF) {
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        if (command == '\r' || command == '\n' || command == ' ') {
            continue;
        }

        if (command == 's') {
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=s accepted=true");
            print_status();
        } else if (command == 'q') {
            if (start_sony_pairing_scan("serial")) {
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=q accepted=true");
            } else {
                ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=q accepted=false");
            }
            print_status();
        } else if (command == 'b') {
            if (start_bonded_sony_scan("serial")) {
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=b accepted=true");
            } else {
                ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=b accepted=false");
            }
            print_status();
        } else if (command == 'p') {
            ESP_LOGI(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=p accepted=true");
            print_timelapse_status();
        } else if (command == 'a') {
            s_timelapse_dry_run = false;
            s_timelapse_live_armed = true;
            ESP_LOGW(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=a accepted=true mode=armed dry_run=false trigger_source=klipper_layer");
            print_timelapse_status();
        } else if (command == 'd') {
            s_timelapse_live_armed = false;
            s_timelapse_dry_run = true;
            ESP_LOGI(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=d accepted=true mode=dry_run armed=false trigger_source=klipper_layer");
            print_timelapse_status();
        } else if (command == 'e') {
            s_timelapse_enabled = !s_timelapse_enabled;
            ESP_LOGI(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=e accepted=true enabled=%s", s_timelapse_enabled ? "true" : "false");
            print_timelapse_status();
        } else if (command == 'w') {
            char payload[192] = {0};
            ESP_LOGI(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=w awaiting_payload format=ssid|password|host");
            if (!read_serial_line(payload, sizeof(payload), 15000)) {
                ESP_LOGW(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=w accepted=false reason=payload_timeout");
                continue;
            }

            char *ssid = NULL;
            char *password = NULL;
            char *host = NULL;
            if (!parse_network_payload(payload, &ssid, &password, &host)) {
                ESP_LOGW(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=w accepted=false reason=bad_payload expected=ssid|password|host");
                continue;
            }

            if (timelapse_save_network_config(ssid, password, host)) {
                ESP_LOGI(TAG,
                         "TIMELAPSE_SERIAL_COMMAND trigger=w accepted=true ssid=%s password_configured=%s host=%s",
                         ssid,
                         password[0] == '\0' ? "false" : "true",
                         host);
            } else {
                ESP_LOGW(TAG, "TIMELAPSE_SERIAL_COMMAND trigger=w accepted=false reason=nvs_save_failed");
            }
        } else if (command == 't') {
            if (!s_ready_for_serial_trigger || !s_connected || s_command_handle == 0) {
                ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=t accepted=false reason=not_ready");
            } else {
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=t accepted=true");
                run_trigger_once_sequence();
            }
        } else if (command == 'r') {
            if (!s_connected || s_command_handle == 0) {
                ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=r accepted=false reason=not_ready");
            } else {
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=r accepted=true");
                release_shutter_buttons();
            }
        } else {
            ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_SERIAL_COMMAND trigger=%c accepted=false reason=unknown_command",
                     command >= 0x20 && command <= 0x7E ? command : '?');
            ESP_LOGI(TAG, "TIMELAPSE_SERIAL_COMMANDS commands=s,q,b,t,r,p,a,d,e,w");
        }
    }
}

static void reset_sony_connection_state(void)
{
    s_search_started = false;
    s_service_found = false;
    s_ready_for_serial_trigger = false;
    s_shutter_in_progress = false;
    s_sequence_completed = false;
    s_conn_id = 0;
    s_service_start_handle = 0;
    s_service_end_handle = 0;
    s_command_found = false;
    s_notify_found = false;
    s_notify_registered = false;
    s_notify_subscribed = false;
    s_command_handle = 0;
    s_notify_handle = 0;
    s_notify_cccd_handle = 0;
    s_command_props = 0;
    s_notify_props = 0;
    s_last_write_status = ESP_GATT_ERROR;
    s_focus_status = 0;
    s_shutter_status = 0;

    if (s_write_done != NULL) {
        xSemaphoreTake(s_write_done, 0);
    }
    if (s_focus_acquired != NULL) {
        xSemaphoreTake(s_focus_acquired, 0);
    }
    if (s_shutter_active != NULL) {
        xSemaphoreTake(s_shutter_active, 0);
    }
}

static void open_bonded_connection(const esp_ble_gap_cb_param_t *scan)
{
    if ((!s_have_target && !s_pairing_requested) || s_connecting || s_connected || s_gattc_if == ESP_GATT_IF_NONE) {
        return;
    }

    reset_sony_connection_state();
    if (s_pairing_requested) {
        memcpy(s_target_addr, scan->scan_rst.bda, ESP_BD_ADDR_LEN);
        s_have_target = true;
    }
    s_connecting = true;
    s_target_addr_type = scan->scan_rst.ble_addr_type;

    if (s_pairing_requested) {
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_START addr=" ESP_BD_ADDR_STR " addr_type=%u no_ff01_writes=true",
                 ESP_BD_ADDR_HEX(s_target_addr), s_target_addr_type);
    } else {
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_CONNECT_START addr=" ESP_BD_ADDR_STR " addr_type=%u",
                 ESP_BD_ADDR_HEX(s_target_addr), s_target_addr_type);
    }
    esp_ble_gap_stop_scanning();

    esp_ble_gatt_creat_conn_params_t conn_params = {0};
    memcpy(conn_params.remote_bda, s_target_addr, ESP_BD_ADDR_LEN);
    conn_params.remote_addr_type = s_target_addr_type;
    conn_params.own_addr_type = BLE_ADDR_TYPE_PUBLIC;
    conn_params.is_direct = true;
    conn_params.is_aux = false;
    conn_params.phy_mask = 0;

    const esp_err_t ret = esp_ble_gattc_enh_open(s_gattc_if, &conn_params);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_OPEN_ERROR err=%s", esp_err_to_name(ret));
        s_connecting = false;
        if (s_pairing_requested) {
            s_pairing_requested = false;
            s_have_target = false;
            log_bonded_devices();
        }
    }
}

static void subscribe_sony_notifications(esp_gatt_if_t gattc_if)
{
    if (!s_notify_found || s_notify_handle == 0) {
        ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_SUBSCRIBE submit=false reason=no_notify_handle");
        return;
    }

    const esp_err_t ret = esp_ble_gattc_register_for_notify(gattc_if, s_target_addr, s_notify_handle);
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_SUBSCRIBE submit=%s err=%s handle=%u",
             ret == ESP_OK ? "true" : "false", esp_err_to_name(ret), s_notify_handle);
}

static void enumerate_sony_characteristics(esp_gatt_if_t gattc_if, uint16_t conn_id)
{
    uint16_t attr_count = 0;
    esp_gatt_status_t status = esp_ble_gattc_get_attr_count(
        gattc_if,
        conn_id,
        ESP_GATT_DB_CHARACTERISTIC,
        s_service_start_handle,
        s_service_end_handle,
        INVALID_HANDLE,
        &attr_count
    );
    if (status != ESP_GATT_OK) {
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_CHAR_COUNT_ERROR status=0x%x", status);
        return;
    }

    esp_gattc_char_elem_t chars[SONY_MAX_SERVICE_CHARS] = {0};
    uint16_t char_count = attr_count < SONY_MAX_SERVICE_CHARS ? attr_count : SONY_MAX_SERVICE_CHARS;
    status = esp_ble_gattc_get_all_char(
        gattc_if,
        conn_id,
        s_service_start_handle,
        s_service_end_handle,
        chars,
        &char_count,
        0
    );
    if (status != ESP_GATT_OK) {
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_CHAR_ENUM_ERROR status=0x%x", status);
        return;
    }

    for (uint16_t index = 0; index < char_count; index++) {
        char uuid_text[48] = {0};
        uuid_to_text(&chars[index].uuid, uuid_text, sizeof(uuid_text));
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_CHARACTERISTIC index=%u uuid=%s handle=%u props=0x%02x",
                 index, uuid_text, chars[index].char_handle, chars[index].properties);

        if (uuid_is_sony_char(&chars[index].uuid, SONY_REMOTE_COMMAND_UUID16)) {
            s_command_found = true;
            s_command_handle = chars[index].char_handle;
            s_command_props = chars[index].properties;
        } else if (uuid_is_sony_char(&chars[index].uuid, SONY_REMOTE_NOTIFY_UUID16)) {
            s_notify_found = true;
            s_notify_handle = chars[index].char_handle;
            s_notify_props = chars[index].properties;
        }
    }

    ESP_LOGI(TAG,
             "SONY_BLUEDROID_SHUTTER_CHARACTERISTICS command_ff01=%s notify_ff02=%s command_handle=%u notify_handle=%u command_props=0x%02x notify_props=0x%02x",
             s_command_found ? "true" : "false",
             s_notify_found ? "true" : "false",
             s_command_handle,
             s_notify_handle,
             s_command_props,
             s_notify_props);

    s_ready_for_serial_trigger = false;
    if (s_command_found && s_command_handle != 0 && s_notify_found && s_notify_handle != 0) {
        subscribe_sony_notifications(gattc_if);
    } else {
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_READY_FOR_SERIAL_TRIGGER ready=false command_handle=%u commands=t,r,s reason=missing_characteristic",
                 s_command_handle);
    }
}

static void gap_callback(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param)
{
    switch (event) {
    case ESP_GAP_BLE_SCAN_PARAM_SET_COMPLETE_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_PARAMS_SET status=%u", param->scan_param_cmpl.status);
        if (param->scan_param_cmpl.status != 0) {
            s_sony_scan_requested = false;
            s_pairing_requested = false;
            break;
        }
        if (s_sony_scan_requested && (s_have_target || s_pairing_requested)) {
            const esp_err_t ret = esp_ble_gap_start_scanning(SCAN_SECONDS);
            if (ret != ESP_OK) {
                s_sony_scan_requested = false;
                s_pairing_requested = false;
                ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_START_SUBMIT err=%s", esp_err_to_name(ret));
            }
        }
        break;

    case ESP_GAP_BLE_SCAN_START_COMPLETE_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_START status=%u", param->scan_start_cmpl.status);
        s_sony_scanning = param->scan_start_cmpl.status == 0;
        if (!s_sony_scanning) {
            s_sony_scan_requested = false;
            s_pairing_requested = false;
        }
        break;

    case ESP_GAP_BLE_SCAN_RESULT_EVT: {
        esp_ble_gap_cb_param_t *scan = param;
        if (scan->scan_rst.search_evt == ESP_GAP_SEARCH_INQ_CMPL_EVT) {
            s_sony_scanning = false;
            if (!s_connecting && !s_connected) {
                s_sony_scan_requested = false;
                if (s_pairing_requested) {
                    s_pairing_requested = false;
                    s_have_target = false;
                    log_bonded_devices();
                    ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_TIMEOUT no_ff01_writes=true");
                }
            }
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_COMPLETE connecting=%s connected=%s ready=%s",
                     s_connecting ? "true" : "false",
                     s_connected ? "true" : "false",
                     s_ready_for_serial_trigger ? "true" : "false");
            break;
        }
        if (scan->scan_rst.search_evt != ESP_GAP_SEARCH_INQ_RES_EVT || s_connecting || s_connected) {
            break;
        }

        uint8_t manufacturer_len = 0;
        uint8_t *manufacturer = esp_ble_resolve_adv_data_by_type(
            scan->scan_rst.ble_adv,
            scan->scan_rst.adv_data_len + scan->scan_rst.scan_rsp_len,
            ESP_BLE_AD_MANUFACTURER_SPECIFIC_TYPE,
            &manufacturer_len
        );
        if (manufacturer == NULL) {
            break;
        }

        bool pairing_open = false;
        bool remote_enabled = false;
        if (!parse_sony_manufacturer(manufacturer, manufacturer_len, &pairing_open, &remote_enabled)) {
            break;
        }

        const bool pairing_candidate = s_pairing_requested && pairing_open && remote_enabled;
        const bool bonded_candidate = !s_pairing_requested && s_have_target &&
                                      bd_addr_equal(scan->scan_rst.bda, s_target_addr) && remote_enabled;
        if (!pairing_candidate && !bonded_candidate) {
            break;
        }

        printf("I (%" PRIu32 ") %s: SONY_BLUEDROID_SHUTTER_FOUND_%s_ADV addr=" ESP_BD_ADDR_STR
               " rssi=%d pairing_open=%s remote_enabled=%s manufacturer_hex=",
               esp_log_timestamp(), TAG, pairing_candidate ? "PAIRING" : "BONDED", ESP_BD_ADDR_HEX(scan->scan_rst.bda),
               scan->scan_rst.rssi,
               pairing_open ? "true" : "false",
               remote_enabled ? "true" : "false");
        print_hex_compact(manufacturer, manufacturer_len);
        printf("\n");

        open_bonded_connection(scan);
        break;
    }

    case ESP_GAP_BLE_SCAN_STOP_COMPLETE_EVT:
        s_sony_scanning = false;
        s_sony_scan_requested = false;
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SCAN_STOP status=%u", param->scan_stop_cmpl.status);
        break;

    case ESP_GAP_BLE_AUTH_CMPL_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_AUTH_COMPLETE success=%s fail_reason=0x%x auth_mode=0x%x addr=" ESP_BD_ADDR_STR,
                 param->ble_security.auth_cmpl.success ? "true" : "false",
                 param->ble_security.auth_cmpl.fail_reason,
                 param->ble_security.auth_cmpl.auth_mode,
                 ESP_BD_ADDR_HEX(param->ble_security.auth_cmpl.bd_addr));
        if (s_pairing_requested) {
            if (param->ble_security.auth_cmpl.success) {
                memcpy(s_target_addr, param->ble_security.auth_cmpl.bd_addr, ESP_BD_ADDR_LEN);
                s_have_target = true;
                s_pairing_requested = false;
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_DONE bonded=true no_ff01_writes=true");
                log_bonded_devices();
            } else {
                s_pairing_requested = false;
                s_have_target = false;
                log_bonded_devices();
                ESP_LOGW(TAG, "SONY_BLUEDROID_SHUTTER_PAIRING_FAILED no_ff01_writes=true");
            }
        }
        break;

    case ESP_GAP_BLE_SEC_REQ_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SECURITY_REQUEST accepting=true addr=" ESP_BD_ADDR_STR,
                 ESP_BD_ADDR_HEX(param->ble_security.ble_req.bd_addr));
        esp_ble_gap_security_rsp(param->ble_security.ble_req.bd_addr, true);
        break;

    case ESP_GAP_BLE_NC_REQ_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NUMERIC_CONFIRM accepting=true passkey=%" PRIu32,
                 param->ble_security.key_notif.passkey);
        esp_ble_confirm_reply(param->ble_security.ble_req.bd_addr, true);
        break;

    default:
        break;
    }
}

static void gattc_callback(esp_gattc_cb_event_t event, esp_gatt_if_t gattc_if, esp_ble_gattc_cb_param_t *param)
{
    switch (event) {
    case ESP_GATTC_REG_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_GATTC_REGISTER status=%u app_id=%u gattc_if=%d",
                 param->reg.status, param->reg.app_id, gattc_if);
        if (param->reg.status == ESP_GATT_OK) {
            s_gattc_if = gattc_if;
            log_bonded_devices();
        }
        break;

    case ESP_GATTC_OPEN_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_GATTC_OPEN status=0x%x conn_id=%u mtu=%u",
                 param->open.status, param->open.conn_id, param->open.mtu);
        if (param->open.status == ESP_GATT_OK) {
            s_connecting = false;
            s_connected = true;
            s_conn_id = param->open.conn_id;
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_ENCRYPTION_START mode=ESP_BLE_SEC_ENCRYPT_NO_MITM addr=" ESP_BD_ADDR_STR,
                     ESP_BD_ADDR_HEX(param->open.remote_bda));
            esp_ble_set_encryption(param->open.remote_bda, ESP_BLE_SEC_ENCRYPT_NO_MITM);
        } else {
            s_connecting = false;
            s_sony_scan_requested = false;
            if (s_pairing_requested) {
                s_pairing_requested = false;
                s_have_target = false;
                log_bonded_devices();
            }
        }
        break;

    case ESP_GATTC_CONNECT_EVT:
        s_connecting = false;
        s_connected = true;
        s_conn_id = param->connect.conn_id;
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_GATTC_CONNECT conn_id=%u addr=" ESP_BD_ADDR_STR,
                 param->connect.conn_id, ESP_BD_ADDR_HEX(param->connect.remote_bda));
        esp_ble_gattc_send_mtu_req(gattc_if, param->connect.conn_id);
        break;

    case ESP_GATTC_CFG_MTU_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_MTU status=0x%x mtu=%u", param->cfg_mtu.status, param->cfg_mtu.mtu);
        break;

    case ESP_GATTC_DIS_SRVC_CMPL_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERVICE_DISCOVERY_COMPLETE status=0x%x conn_id=%u",
                 param->dis_srvc_cmpl.status, param->dis_srvc_cmpl.conn_id);
        if (param->dis_srvc_cmpl.status == ESP_GATT_OK && !s_search_started) {
            s_search_started = true;
            esp_ble_gattc_search_service(gattc_if, param->dis_srvc_cmpl.conn_id, NULL);
        }
        break;

    case ESP_GATTC_SEARCH_RES_EVT: {
        char uuid_text[48] = {0};
        uuid_to_text(&param->search_res.srvc_id.uuid, uuid_text, sizeof(uuid_text));
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERVICE_SCAN uuid=%s start=%u end=%u primary=%s",
                 uuid_text,
                 param->search_res.start_handle,
                 param->search_res.end_handle,
                 param->search_res.is_primary ? "true" : "false");
        if (uuid_is_sony_remote_service(&param->search_res.srvc_id.uuid)) {
            s_service_found = true;
            s_service_start_handle = param->search_res.start_handle;
            s_service_end_handle = param->search_res.end_handle;
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SERVICE uuid=8000FF00-FF00-FFFF-FFFF-FFFFFFFFFFFF found=true start=%u end=%u",
                     s_service_start_handle, s_service_end_handle);
        }
        break;
    }

    case ESP_GATTC_SEARCH_CMPL_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SEARCH_COMPLETE status=0x%x conn_id=%u source=%u",
                 param->search_cmpl.status,
                 param->search_cmpl.conn_id,
                 param->search_cmpl.searched_service_source);
        if (param->search_cmpl.status == ESP_GATT_OK && s_service_found) {
            enumerate_sony_characteristics(gattc_if, param->search_cmpl.conn_id);
        }
        break;

    case ESP_GATTC_WRITE_CHAR_EVT:
        s_last_write_status = param->write.status;
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_WRITE_RESULT status=0x%x handle=%u conn_id=%u",
                 param->write.status, param->write.handle, param->write.conn_id);
        if (s_write_done != NULL) {
            xSemaphoreGive(s_write_done);
        }
        break;

    case ESP_GATTC_REG_FOR_NOTIFY_EVT: {
        s_notify_registered = param->reg_for_notify.status == ESP_GATT_OK;
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_REGISTER status=0x%x handle=%u registered=%s",
                 param->reg_for_notify.status,
                 param->reg_for_notify.handle,
                 s_notify_registered ? "true" : "false");
        if (!s_notify_registered) {
            break;
        }

        esp_bt_uuid_t cccd_uuid = {
            .len = ESP_UUID_LEN_16,
            .uuid = {.uuid16 = ESP_GATT_UUID_CHAR_CLIENT_CONFIG},
        };
        esp_gattc_descr_elem_t descriptor = {0};
        uint16_t descriptor_count = 1;
        esp_gatt_status_t status = esp_ble_gattc_get_descr_by_char_handle(
            gattc_if,
            s_conn_id,
            s_notify_handle,
            cccd_uuid,
            &descriptor,
            &descriptor_count
        );
        if (status != ESP_GATT_OK || descriptor_count == 0 || descriptor.handle == 0) {
            ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_CCCD_LOOKUP status=0x%x count=%u handle=%u",
                     status, descriptor_count, descriptor.handle);
            break;
        }

        s_notify_cccd_handle = descriptor.handle;
        const esp_err_t ret = esp_ble_gattc_write_char_descr(
            gattc_if,
            s_conn_id,
            s_notify_cccd_handle,
            sizeof(COMMAND_ENABLE_NOTIFY),
            COMMAND_ENABLE_NOTIFY,
            ESP_GATT_WRITE_TYPE_RSP,
            ESP_GATT_AUTH_REQ_NONE
        );
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_CCCD_WRITE submit=%s err=%s handle=%u value=0100",
                 ret == ESP_OK ? "true" : "false", esp_err_to_name(ret), s_notify_cccd_handle);
        break;
    }

    case ESP_GATTC_WRITE_DESCR_EVT:
        if (param->write.handle == s_notify_cccd_handle) {
            s_notify_subscribed = param->write.status == ESP_GATT_OK;
            s_ready_for_serial_trigger = s_notify_subscribed && s_command_found && s_command_handle != 0;
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY_CCCD_RESULT status=0x%x handle=%u notify_subscribed=%s",
                     param->write.status, param->write.handle, s_notify_subscribed ? "true" : "false");
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_READY_FOR_SERIAL_TRIGGER ready=%s command_handle=%u commands=t,r,s",
                     s_ready_for_serial_trigger ? "true" : "false", s_command_handle);
        } else {
            ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_WRITE_DESCR_RESULT status=0x%x handle=%u conn_id=%u",
                     param->write.status, param->write.handle, param->write.conn_id);
        }
        break;

    case ESP_GATTC_NOTIFY_EVT:
        printf("I (%" PRIu32 ") %s: SONY_BLUEDROID_SHUTTER_NOTIFY_RAW handle=%u len=%u data=",
               esp_log_timestamp(), TAG, param->notify.handle, param->notify.value_len);
        print_hex_compact(param->notify.value, param->notify.value_len);
        printf(" is_notify=%s\n", param->notify.is_notify ? "true" : "false");
        if (param->notify.value_len >= 3 && param->notify.value[0] == 0x02) {
            const uint8_t status_type = param->notify.value[1];
            const uint8_t status_value = param->notify.value[2];
            if (status_type == 0x3F) {
                s_focus_status = status_value;
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY status_type=0x3f value=0x%02x focus_acquired=%s",
                         status_value, (status_value & SONY_STATUS_ACTIVE) ? "true" : "false");
                if ((status_value & SONY_STATUS_ACTIVE) && s_focus_acquired != NULL) {
                    xSemaphoreGive(s_focus_acquired);
                }
            } else if (status_type == 0xA0) {
                s_shutter_status = status_value;
                ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_NOTIFY status_type=0xa0 value=0x%02x shutter_active=%s",
                         status_value, (status_value & SONY_STATUS_ACTIVE) ? "true" : "false");
                if ((status_value & SONY_STATUS_ACTIVE) && s_shutter_active != NULL) {
                    xSemaphoreGive(s_shutter_active);
                }
            }
        }
        break;

    case ESP_GATTC_DISCONNECT_EVT:
        ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_GATTC_DISCONNECT reason=0x%02x addr=" ESP_BD_ADDR_STR,
                 param->disconnect.reason, ESP_BD_ADDR_HEX(param->disconnect.remote_bda));
        s_connected = false;
        s_connecting = false;
        s_sony_scan_requested = false;
        s_sony_scanning = false;
        if (s_pairing_requested) {
            s_pairing_requested = false;
            s_have_target = false;
            log_bonded_devices();
        }
        reset_sony_connection_state();
        break;

    default:
        break;
    }
}

static void load_nvs_string(nvs_handle_t handle, const char *key, char *target, size_t target_len)
{
    size_t required = target_len;
    const esp_err_t ret = nvs_get_str(handle, key, target, &required);
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        return;
    }
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "TIMELAPSE_NVS_READ_WARN key=%s err=%s", key, esp_err_to_name(ret));
    }
}

static void timelapse_load_network_config(void)
{
    nvs_handle_t handle = 0;
    const esp_err_t ret = nvs_open(TIMELAPSE_NVS_NAMESPACE, NVS_READONLY, &handle);
    if (ret == ESP_ERR_NVS_NOT_FOUND) {
        ESP_LOGI(TAG,
                 "TIMELAPSE_NETWORK_CONFIG source=defaults ssid_configured=%s password_configured=%s host=%s",
                 s_timelapse_wifi_ssid[0] == '\0' ? "false" : "true",
                 s_timelapse_wifi_password[0] == '\0' ? "false" : "true",
                 s_timelapse_moonraker_host);
        return;
    }
    if (ret != ESP_OK) {
        ESP_LOGW(TAG, "TIMELAPSE_NETWORK_CONFIG_READ_ERROR err=%s", esp_err_to_name(ret));
        return;
    }

    load_nvs_string(handle, "ssid", s_timelapse_wifi_ssid, sizeof(s_timelapse_wifi_ssid));
    load_nvs_string(handle, "password", s_timelapse_wifi_password, sizeof(s_timelapse_wifi_password));
    load_nvs_string(handle, "host", s_timelapse_moonraker_host, sizeof(s_timelapse_moonraker_host));
    nvs_close(handle);

    ESP_LOGI(TAG,
             "TIMELAPSE_NETWORK_CONFIG source=nvs ssid_configured=%s password_configured=%s host=%s",
             s_timelapse_wifi_ssid[0] == '\0' ? "false" : "true",
             s_timelapse_wifi_password[0] == '\0' ? "false" : "true",
             s_timelapse_moonraker_host);
}

static void fill_wifi_config(wifi_config_t *wifi_config)
{
    memset(wifi_config, 0, sizeof(*wifi_config));
    snprintf((char *)wifi_config->sta.ssid, sizeof(wifi_config->sta.ssid), "%s", s_timelapse_wifi_ssid);
    snprintf((char *)wifi_config->sta.password, sizeof(wifi_config->sta.password), "%s", s_timelapse_wifi_password);
    wifi_config->sta.threshold.authmode = strlen(s_timelapse_wifi_password) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;
}

static void timelapse_apply_wifi_config(void)
{
    if (!s_wifi_started || strlen(s_timelapse_wifi_ssid) == 0) {
        return;
    }

    wifi_config_t wifi_config = {0};
    fill_wifi_config(&wifi_config);
    s_wifi_retry_count = 0;
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    esp_wifi_disconnect();
    esp_wifi_connect();
    ESP_LOGI(TAG,
             "TIMELAPSE_WIFI_CONFIG_APPLIED ssid=%s password_configured=%s",
             s_timelapse_wifi_ssid,
             s_timelapse_wifi_password[0] == '\0' ? "false" : "true");
}

static bool timelapse_save_network_config(const char *ssid, const char *password, const char *host)
{
    nvs_handle_t handle = 0;
    const esp_err_t open_ret = nvs_open(TIMELAPSE_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (open_ret != ESP_OK) {
        ESP_LOGE(TAG, "TIMELAPSE_NVS_OPEN_ERROR err=%s", esp_err_to_name(open_ret));
        return false;
    }

    esp_err_t ret = nvs_set_str(handle, "ssid", ssid);
    if (ret == ESP_OK) {
        ret = nvs_set_str(handle, "password", password);
    }
    if (ret == ESP_OK) {
        ret = nvs_set_str(handle, "host", host);
    }
    if (ret == ESP_OK) {
        ret = nvs_commit(handle);
    }
    nvs_close(handle);

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "TIMELAPSE_NVS_SAVE_ERROR err=%s", esp_err_to_name(ret));
        return false;
    }

    snprintf(s_timelapse_wifi_ssid, sizeof(s_timelapse_wifi_ssid), "%s", ssid);
    snprintf(s_timelapse_wifi_password, sizeof(s_timelapse_wifi_password), "%s", password);
    snprintf(s_timelapse_moonraker_host, sizeof(s_timelapse_moonraker_host), "%s", host);
    ESP_LOGI(TAG,
             "TIMELAPSE_NETWORK_CONFIG_SAVED ssid=%s password_configured=%s host=%s",
             s_timelapse_wifi_ssid,
             s_timelapse_wifi_password[0] == '\0' ? "false" : "true",
             s_timelapse_moonraker_host);

    if (s_wifi_started) {
        timelapse_apply_wifi_config();
    } else {
        timelapse_wifi_init_sta();
    }
    return true;
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base, int32_t event_id, void *event_data)
{
    (void)arg;
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        s_wifi_connected = false;
        if (s_wifi_retry_count < TIMELAPSE_WIFI_MAX_RETRY) {
            s_wifi_retry_count++;
            ESP_LOGW(TAG, "TIMELAPSE_WIFI_DISCONNECTED retry=%d max=%d", s_wifi_retry_count, TIMELAPSE_WIFI_MAX_RETRY);
            esp_wifi_connect();
        } else if (s_wifi_event_group != NULL) {
            ESP_LOGE(TAG, "TIMELAPSE_WIFI_FAILED max_retry=%d", TIMELAPSE_WIFI_MAX_RETRY);
            xEventGroupSetBits(s_wifi_event_group, TIMELAPSE_WIFI_FAIL_BIT);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        s_wifi_connected = true;
        s_wifi_retry_count = 0;
        ESP_LOGI(TAG, "TIMELAPSE_WIFI_CONNECTED ip=" IPSTR, IP2STR(&event->ip_info.ip));
        if (s_wifi_event_group != NULL) {
            xEventGroupSetBits(s_wifi_event_group, TIMELAPSE_WIFI_CONNECTED_BIT);
        }
    }
}

static void timelapse_wifi_init_sta(void)
{
    if (s_wifi_started) {
        timelapse_apply_wifi_config();
        return;
    }

    if (strlen(s_timelapse_wifi_ssid) == 0) {
        ESP_LOGW(TAG, "TIMELAPSE_WIFI_DISABLED reason=missing_TIMELAPSE_WIFI_SSID");
        return;
    }

    s_wifi_event_group = xEventGroupCreate();
    if (s_wifi_event_group == NULL) {
        ESP_LOGE(TAG, "TIMELAPSE_WIFI_EVENT_GROUP_ERROR");
        return;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    esp_err_t err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_ERROR_CHECK(err);
    }
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, NULL));

    wifi_config_t wifi_config = {0};
    fill_wifi_config(&wifi_config);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    s_wifi_started = true;
    ESP_LOGI(TAG,
             "TIMELAPSE_WIFI_START ssid=%s password_configured=%s",
             s_timelapse_wifi_ssid,
             strlen(s_timelapse_wifi_password) > 0 ? "true" : "false");

    const EventBits_t bits = xEventGroupWaitBits(
        s_wifi_event_group,
        TIMELAPSE_WIFI_CONNECTED_BIT | TIMELAPSE_WIFI_FAIL_BIT,
        pdFALSE,
        pdFALSE,
        pdMS_TO_TICKS(15000)
    );
    if (bits & TIMELAPSE_WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "TIMELAPSE_WIFI_INITIAL_WAIT connected=true");
    } else if (bits & TIMELAPSE_WIFI_FAIL_BIT) {
        ESP_LOGW(TAG, "TIMELAPSE_WIFI_INITIAL_WAIT connected=false reason=wifi_fail");
    } else {
        ESP_LOGW(TAG, "TIMELAPSE_WIFI_WAIT_TIMEOUT timeout_ms=15000");
    }
}

static esp_err_t timelapse_http_event_handler(esp_http_client_event_t *evt)
{
    timelapse_http_capture_t *capture = (timelapse_http_capture_t *)evt->user_data;
    if (evt->event_id != HTTP_EVENT_ON_DATA || evt->data_len <= 0 || capture == NULL) {
        return ESP_OK;
    }

    if (capture->length + evt->data_len >= capture->capacity) {
        ESP_LOGE(TAG,
                 "TIMELAPSE_HTTP_RESPONSE_TOO_LARGE current=%d incoming=%d capacity=%d",
                 capture->length,
                 evt->data_len,
                 capture->capacity);
        return ESP_FAIL;
    }

    memcpy(capture->body + capture->length, evt->data, evt->data_len);
    capture->length += evt->data_len;
    capture->body[capture->length] = '\0';
    return ESP_OK;
}

static bool timelapse_fetch_moonraker_status(char *response, size_t response_len)
{
    char url[192] = {0};
    snprintf(url, sizeof(url), "http://%s:%d%s", s_timelapse_moonraker_host, TIMELAPSE_MOONRAKER_PORT, TIMELAPSE_STATUS_PATH);

    timelapse_http_capture_t capture = {
        .body = response,
        .length = 0,
        .capacity = (int)response_len,
    };
    response[0] = '\0';

    esp_http_client_config_t config = {
        .url = url,
        .event_handler = timelapse_http_event_handler,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 3000,
        .buffer_size = 1024,
        .user_data = &capture,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        ESP_LOGE(TAG, "TIMELAPSE_HTTP_INIT_ERROR");
        return false;
    }

    const esp_err_t err = esp_http_client_perform(client);
    const int status_code = esp_http_client_get_status_code(client);
    ESP_LOGI(TAG,
             "TIMELAPSE_HTTP_GET path=%s ok=%s status=%d bytes=%d",
             TIMELAPSE_STATUS_PATH,
             err == ESP_OK ? "true" : "false",
             status_code,
             capture.length);
    esp_http_client_cleanup(client);

    return err == ESP_OK && status_code == 200 && capture.length > 0;
}

static void timelapse_poll_task(void *arg)
{
    (void)arg;
    char *response = calloc(1, TIMELAPSE_HTTP_RESPONSE_MAX);
    if (response == NULL) {
        ESP_LOGE(TAG, "TIMELAPSE_POLL_ALLOC_ERROR bytes=%d", TIMELAPSE_HTTP_RESPONSE_MAX);
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG,
             "TIMELAPSE_POLL_TASK_START enabled=%s dry_run=%s armed=%s startup_delay_ms=%d trigger_source=klipper_layer",
             s_timelapse_enabled ? "true" : "false",
             s_timelapse_dry_run ? "true" : "false",
             s_timelapse_live_armed ? "true" : "false",
             TIMELAPSE_STARTUP_DELAY_MS);
    vTaskDelay(pdMS_TO_TICKS(TIMELAPSE_STARTUP_DELAY_MS));

    while (true) {
        if (!s_timelapse_enabled) {
            vTaskDelay(pdMS_TO_TICKS(TIMELAPSE_POLL_INTERVAL_MS));
            continue;
        }

        if (!s_wifi_connected) {
            ESP_LOGW(TAG, "TIMELAPSE_POLL_SKIP reason=wifi_not_connected");
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }

        if (sony_ble_is_busy()) {
            ESP_LOGW(TAG, "TIMELAPSE_POLL_SKIP reason=sony_ble_busy");
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (timelapse_fetch_moonraker_status(response, TIMELAPSE_HTTP_RESPONSE_MAX)) {
            timelapse_layer_event_t event = {0};
            if (timelapse_parse_layer_event(response, &event)) {
                if (timelapse_handle_macro_event(&event)) {
                    timelapse_handle_layer_event(&event);
                } else {
                    timelapse_handle_layer_event(&event);
                }
            }
        } else {
            ESP_LOGW(TAG, "TIMELAPSE_POLL_SKIP reason=moonraker_http_failed");
        }

        vTaskDelay(pdMS_TO_TICKS(TIMELAPSE_POLL_INTERVAL_MS));
    }
}

static void configure_security(void)
{
    esp_ble_auth_req_t auth_req = ESP_LE_AUTH_BOND;
    esp_ble_io_cap_t iocap = ESP_IO_CAP_NONE;
    uint8_t key_size = 16;
    uint8_t init_key = ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK;
    uint8_t rsp_key = ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK;
    uint8_t oob_support = ESP_BLE_OOB_DISABLE;

    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_SECURITY_CONFIG auth=ESP_LE_AUTH_BOND io_cap=ESP_IO_CAP_NONE encrypt=ESP_BLE_SEC_ENCRYPT_NO_MITM key_size=16 key_dist=enc_id");
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_AUTHEN_REQ_MODE, &auth_req, sizeof(auth_req)));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_IOCAP_MODE, &iocap, sizeof(iocap)));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_MAX_KEY_SIZE, &key_size, sizeof(key_size)));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_OOB_SUPPORT, &oob_support, sizeof(oob_support)));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_INIT_KEY, &init_key, sizeof(init_key)));
    ESP_ERROR_CHECK(esp_ble_gap_set_security_param(ESP_BLE_SM_SET_RSP_KEY, &rsp_key, sizeof(rsp_key)));
}

void app_main(void)
{
    ESP_LOGI(TAG, "SONY_BLUEDROID_SHUTTER_PROBE_READY user_approved=true manual_serial_trigger=true safe_mode=live_shutter service=%s",
             SONY_REMOTE_SERVICE_UUID_TEXT);

    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);
    s_write_done = xSemaphoreCreateBinary();
    s_focus_acquired = xSemaphoreCreateBinary();
    s_shutter_active = xSemaphoreCreateBinary();
    if (s_write_done == NULL || s_focus_acquired == NULL || s_shutter_active == NULL) {
        ESP_LOGE(TAG, "SONY_BLUEDROID_SHUTTER_SEMAPHORE_ERROR");
        return;
    }

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    timelapse_load_network_config();
    ESP_LOGI(TAG,
             "KLIPPER_SONY_TIMELAPSE_READY enabled=%s dry_run=%s armed=%s serial_arm_required=true moonraker_host=%s moonraker_port=%d path=%s",
             s_timelapse_enabled ? "true" : "false",
             s_timelapse_dry_run ? "true" : "false",
             s_timelapse_live_armed ? "true" : "false",
             s_timelapse_moonraker_host,
             TIMELAPSE_MOONRAKER_PORT,
             TIMELAPSE_STATUS_PATH);
    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT));
    timelapse_wifi_init_sta();

    esp_bt_controller_config_t bt_cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&bt_cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    ESP_ERROR_CHECK(esp_ble_gap_register_callback(gap_callback));
    ESP_ERROR_CHECK(esp_ble_gattc_register_callback(gattc_callback));
    ESP_ERROR_CHECK(esp_ble_gattc_app_register(PROFILE_APP_ID));
    ESP_ERROR_CHECK(esp_ble_gatt_set_local_mtu(200));

    configure_security();
    xTaskCreate(serial_command_task, "sony_serial_command", 4096, NULL, 5, NULL);
    xTaskCreate(timelapse_poll_task, "timelapse_poll", 8192, NULL, 4, NULL);

    while (true) {
        print_status();
        print_timelapse_status();
        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}
