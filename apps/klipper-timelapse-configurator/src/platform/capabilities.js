export function detectCapabilities(input) {
  const blockers = [];
  if (!input.isSecureContext) blockers.push("secureContextRequired");
  if (!input.hasSerial) blockers.push("webSerialMissing");

  return {
    canUseWebSerial: blockers.length === 0,
    blockers,
    browserLabel: input.userAgent.includes("Edg") ? "Edge" : "Chrome/Edge"
  };
}

export function detectCurrentCapabilities() {
  return detectCapabilities({
    isSecureContext: window.isSecureContext,
    hasSerial: "serial" in navigator,
    userAgent: navigator.userAgent
  });
}
