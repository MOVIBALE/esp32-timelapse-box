#include <Arduino.h>

#include <Camera.h>
#include <CameraList.h>
#include <Device.h>
#include <PairingApproval.h>
#include <Scan.h>

#include <atomic>

namespace {

constexpr uint32_t CONNECT_TIMEOUT_MS = 30000;
constexpr uint32_t SHUTTER_HOLD_MS = 180;

std::atomic<bool> connecting {false};
std::atomic<Furble::Camera *> activeCamera {nullptr};
String input;

const char *typeName(Furble::Camera::Type type) {
  using Type = Furble::Camera::Type;
  switch (type) {
    case Type::FUJIFILM_BASIC: return "fujifilm_basic";
    case Type::FUJIFILM_SECURE: return "fujifilm_secure";
    case Type::CANON_EOS_REMOTE: return "canon_remote";
    case Type::CANON_EOS_SMART: return "canon_smart";
    case Type::NIKON: return "nikon_remote";
    case Type::RICOH: return "ricoh_gr";
    default: return "unsupported";
  }
}

void printCamera(size_t index, Furble::Camera *camera) {
  Serial.printf("__MB_CAMERA__{\"index\":%u,\"type\":\"%s\",\"name\":\"%s\",\"address\":\"%s\",\"connected\":%s}\r\n",
                static_cast<unsigned>(index), typeName(camera->getType()), camera->getName().c_str(),
                camera->getAddress().toString().c_str(), camera->isConnected() ? "true" : "false");
}

void printList() {
  Serial.printf("__MB_LIST_BEGIN__{\"count\":%u}\r\n", static_cast<unsigned>(Furble::CameraList::size()));
  for (size_t i = 0; i < Furble::CameraList::size(); ++i) printCamera(i, Furble::CameraList::get(i));
  Serial.println("__MB_LIST_END__{}");
}

void printStatus() {
  Furble::Camera *camera = activeCamera.load();
  const bool connected = camera != nullptr && camera->isConnected();
  Serial.printf("__MB_STATUS__{\"experimental\":true,\"stack\":\"nimble\",\"scanning\":%s,\"connecting\":%s,\"connected\":%s,\"ready\":%s,\"pairing_input_pending\":%s",
                Furble::Scan::getInstance().isActive() ? "true" : "false",
                connecting.load() ? "true" : "false", connected ? "true" : "false",
                connected ? "true" : "false", Furble::PairingApproval::isPending() ? "true" : "false");
  if (camera != nullptr) {
    Serial.printf(",\"type\":\"%s\",\"name\":\"%s\"", typeName(camera->getType()), camera->getName().c_str());
  }
  Serial.println("}");
}

void onScanResult(void *) {
  if (Furble::CameraList::size() == 0) return;
  const size_t index = Furble::CameraList::size() - 1;
  printCamera(index, Furble::CameraList::get(index));
}

struct ConnectRequest { size_t index; };

void connectTask(void *parameter) {
  std::unique_ptr<ConnectRequest> request(static_cast<ConnectRequest *>(parameter));
  Furble::Camera *camera = Furble::CameraList::get(request->index);
  Serial.printf("__MB_CONNECTING__{\"index\":%u,\"type\":\"%s\"}\r\n",
                static_cast<unsigned>(request->index), typeName(camera->getType()));
  const bool ok = camera->connect(ESP_PWR_LVL_P3, CONNECT_TIMEOUT_MS);
  if (ok) {
    activeCamera.store(camera);
    camera->setActive(true);
    Furble::CameraList::save(camera);
  }
  connecting.store(false);
  Serial.printf("__MB_CONNECT_RESULT__{\"ok\":%s,\"ready\":%s,\"type\":\"%s\"}\r\n",
                ok ? "true" : "false", ok ? "true" : "false", typeName(camera->getType()));
  vTaskDelete(nullptr);
}

void beginConnect(size_t index) {
  if (connecting.load() || activeCamera.load() != nullptr) {
    Serial.println("__MB_ERROR__{\"code\":\"busy\"}");
    return;
  }
  if (index >= Furble::CameraList::size()) {
    Serial.println("__MB_ERROR__{\"code\":\"invalid_index\"}");
    return;
  }
  Furble::Scan::getInstance().stop();
  connecting.store(true);
  auto *request = new ConnectRequest {index};
  if (xTaskCreate(connectTask, "camera-connect", 12288, request, 4, nullptr) != pdPASS) {
    delete request;
    connecting.store(false);
    Serial.println("__MB_ERROR__{\"code\":\"connect_task_failed\"}");
  }
}

void handleCommand(String command) {
  command.trim();
  if (command == "help") {
    Serial.println("__MB_HELP__{\"commands\":[\"scan\",\"stop\",\"list\",\"saved\",\"connect N\",\"status\",\"shot\",\"disconnect\",\"forget\",\"yes\",\"no\",\"pin NNNNNN\"]}");
  } else if (command == "scan") {
    if (connecting.load() || activeCamera.load() != nullptr) {
      Serial.println("__MB_ERROR__{\"code\":\"busy\"}");
      return;
    }
    Furble::CameraList::clear();
    Furble::Scan::getInstance().clear();
    Furble::Scan::getInstance().start(onScanResult, nullptr);
    Serial.println("__MB_SCAN_STARTED__{\"writes\":false}");
  } else if (command == "stop") {
    Furble::Scan::getInstance().stop();
    Serial.println("__MB_SCAN_STOPPED__{}");
    printList();
  } else if (command == "list") {
    Furble::Scan::getInstance().stop();
    printList();
  } else if (command == "saved") {
    if (activeCamera.load() != nullptr || connecting.load()) {
      Serial.println("__MB_ERROR__{\"code\":\"busy\"}");
      return;
    }
    Furble::Scan::getInstance().stop();
    Furble::CameraList::load();
    printList();
  } else if (command.startsWith("connect ")) {
    const String value = command.substring(8);
    bool valid = value.length() > 0;
    for (size_t i = 0; i < value.length(); ++i) valid = valid && isDigit(value[i]);
    if (valid) beginConnect(static_cast<size_t>(value.toInt()));
    else Serial.println("__MB_ERROR__{\"code\":\"invalid_index\"}");
  } else if (command == "status") {
    printStatus();
  } else if (command == "shot") {
    Furble::Camera *camera = activeCamera.load();
    if (camera == nullptr || !camera->isConnected()) {
      Serial.println("__MB_SHOT_RESULT__{\"ok\":false,\"reason\":\"not_ready\"}");
      return;
    }
    camera->shutterPress();
    delay(SHUTTER_HOLD_MS);
    camera->shutterRelease();
    Serial.println("__MB_SHOT_RESULT__{\"ok\":true,\"manual\":true}");
  } else if (command == "disconnect") {
    Furble::Camera *camera = activeCamera.exchange(nullptr);
    if (camera != nullptr) camera->disconnect();
    Serial.println("__MB_DISCONNECTED__{}");
  } else if (command == "forget") {
    Furble::Camera *camera = activeCamera.exchange(nullptr);
    if (camera == nullptr) {
      Serial.println("__MB_ERROR__{\"code\":\"no_active_camera\"}");
      return;
    }
    camera->disconnect();
    Furble::CameraList::remove(camera);
    Serial.println("__MB_FORGOTTEN__{}");
  } else if (command == "yes" || command == "no") {
    const bool accepted = Furble::PairingApproval::submitConfirmation(command == "yes");
    Serial.printf("__MB_PAIRING_INPUT__{\"accepted\":%s,\"handled\":%s}\r\n",
                  command == "yes" ? "true" : "false", accepted ? "true" : "false");
  } else if (command.startsWith("pin ")) {
    const String value = command.substring(4);
    bool valid = value.length() == 6;
    for (size_t i = 0; i < value.length(); ++i) valid = valid && isDigit(value[i]);
    const bool handled = valid && Furble::PairingApproval::submitPasskey(value.toInt());
    Serial.printf("__MB_PAIRING_INPUT__{\"type\":\"passkey\",\"handled\":%s}\r\n", handled ? "true" : "false");
  } else if (command.length() > 0) {
    Serial.println("__MB_ERROR__{\"code\":\"unknown_command\"}");
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(1000);
  Furble::Device::init(ESP_PWR_LVL_P3);
  Serial.println("__MB_READY__{\"firmware\":\"multibrand-nimble-experimental\",\"hardware_validated\":false,\"auto_shutter\":false}");
  handleCommand("help");
}

void loop() {
  while (Serial.available()) {
    const char ch = static_cast<char>(Serial.read());
    if (ch == '\n' || ch == '\r') {
      if (input.length() > 0) {
        handleCommand(input);
        input = "";
      }
    } else if (input.length() < 96) {
      input += ch;
    }
  }
  delay(5);
}
