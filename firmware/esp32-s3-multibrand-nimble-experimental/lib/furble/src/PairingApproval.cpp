#include <Arduino.h>
#include <atomic>

#include "PairingApproval.h"

namespace Furble {
namespace {

enum class Request : uint8_t { NONE, CONFIRM, PASSKEY };

std::atomic<Request> pending {Request::NONE};
std::atomic<int> decision {-1};
std::atomic<uint32_t> enteredPasskey {0};

bool waitForResponse(Request request, uint32_t timeoutMs) {
  const uint32_t started = millis();
  while (pending.load() == request && millis() - started < timeoutMs) {
    delay(20);
  }
  if (pending.load() == request) {
    pending.store(Request::NONE);
    Serial.println("__MB_PAIRING_TIMEOUT__{\"accepted\":false}");
    return false;
  }
  return true;
}

}  // namespace

bool PairingApproval::requestConfirmation(uint32_t pin, const char *address, uint32_t timeoutMs) {
  decision.store(-1);
  pending.store(Request::CONFIRM);
  Serial.printf("__MB_PAIRING_CONFIRM__{\"address\":\"%s\",\"pin\":\"%06lu\",\"commands\":[\"yes\",\"no\"]}\r\n",
                address, static_cast<unsigned long>(pin));
  if (!waitForResponse(Request::CONFIRM, timeoutMs)) return false;
  return decision.load() == 1;
}

bool PairingApproval::requestPasskey(uint32_t &pin, const char *address, uint32_t timeoutMs) {
  enteredPasskey.store(0);
  pending.store(Request::PASSKEY);
  Serial.printf("__MB_PAIRING_PASSKEY_REQUIRED__{\"address\":\"%s\",\"command\":\"pin NNNNNN\"}\r\n",
                address);
  if (!waitForResponse(Request::PASSKEY, timeoutMs)) return false;
  pin = enteredPasskey.load();
  return true;
}

void PairingApproval::showPasskey(uint32_t pin, const char *address) {
  Serial.printf("__MB_PAIRING_DISPLAY__{\"address\":\"%s\",\"pin\":\"%06lu\",\"action\":\"enter_or_confirm_on_camera\"}\r\n",
                address, static_cast<unsigned long>(pin));
}

bool PairingApproval::submitConfirmation(bool accepted) {
  if (pending.load() != Request::CONFIRM) return false;
  decision.store(accepted ? 1 : 0);
  pending.store(Request::NONE);
  return true;
}

bool PairingApproval::submitPasskey(uint32_t pin) {
  if (pending.load() != Request::PASSKEY || pin > 999999) return false;
  enteredPasskey.store(pin);
  pending.store(Request::NONE);
  return true;
}

bool PairingApproval::isPending() {
  return pending.load() != Request::NONE;
}

}  // namespace Furble
