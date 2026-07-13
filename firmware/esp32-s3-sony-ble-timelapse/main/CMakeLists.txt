idf_component_register(SRCS "sony_bluedroid_shutter_probe.c"
                       INCLUDE_DIRS "."
                       REQUIRES bt esp_http_client esp_timer esp_wifi esp_netif json nvs_flash)
