export const DEFAULT_HARDWARE_ROUTE_ID = "esp32-s3-sony-ble";

const routes = {
  "esp32-s3-sony-ble": Object.freeze({
    id: "esp32-s3-sony-ble",
    labelKey: "routeS3Label",
    descriptionKey: "routeS3Description",
    transport: "serial-command",
    canUploadFiles: false,
    canRecoverMain: false,
    canConnectSony: true,
    supportsBackendSelection: false,
    initialSafetyMode: "dry-run"
  }),
  "esp32-c3-compatible": Object.freeze({
    id: "esp32-c3-compatible",
    labelKey: "routeC3Label",
    descriptionKey: "routeC3Description",
    transport: "micropython-raw-repl",
    canUploadFiles: true,
    canRecoverMain: true,
    canConnectSony: false,
    supportsBackendSelection: true,
    initialSafetyMode: "disabled"
  })
};

export const HARDWARE_ROUTES = Object.freeze(routes);

export function getHardwareRoute(routeId = DEFAULT_HARDWARE_ROUTE_ID) {
  return HARDWARE_ROUTES[routeId] || HARDWARE_ROUTES[DEFAULT_HARDWARE_ROUTE_ID];
}

