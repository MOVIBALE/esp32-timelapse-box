#ifndef PAIRING_APPROVAL_H
#define PAIRING_APPROVAL_H

#include <cstdint>

namespace Furble {

class PairingApproval {
 public:
  static bool requestConfirmation(uint32_t pin, const char *address, uint32_t timeoutMs = 60000);
  static bool requestPasskey(uint32_t &pin, const char *address, uint32_t timeoutMs = 60000);
  static void showPasskey(uint32_t pin, const char *address);
  static bool submitConfirmation(bool accepted);
  static bool submitPasskey(uint32_t pin);
  static bool isPending();
};

}  // namespace Furble

#endif
