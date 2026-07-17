// Experimental protocol facts only. Nothing in this module opens a BLE connection.

export const FURBLE_REFERENCE = Object.freeze({
  repository: "https://github.com/gkoh/furble",
  commit: "246de0861b8907a68eec3f2496dcfc666f41816b",
  license: "MIT"
});

const FUJIFILM_COMPANY_ID = 0x04d8;
const NIKON_SERVICE_UUID = "0000de00-3dd4-4255-8d62-6dc7b9bd5561";

export const CAMERA_BLE_PROTOCOLS = deepFreeze({
  canon_br_e1: {
    brand: "Canon",
    transport: "BLE GATT remote emulation",
    validation: "upstream-only",
    advertisedServiceUuids: ["00050000-0000-1000-0000-d8492fffa821"],
    pairing: {
      security: "bonded secure connection",
      identityCharacteristic: "00050002-0000-1000-0000-d8492fffa821",
      identityPrefix: [0x03]
    },
    shutter: {
      serviceUuid: "00050000-0000-1000-0000-d8492fffa821",
      characteristicUuid: "00050003-0000-1000-0000-d8492fffa821",
      press: [[0x8c]],
      release: [[0x0c]]
    }
  },
  canon_smart: {
    brand: "Canon",
    transport: "BLE GATT smart-device mode",
    validation: "upstream-only",
    advertisedServiceUuids: ["00010000-0000-1000-0000-d8492fffa821"],
    pairing: { security: "bonded secure connection plus Canon pairing handshake" },
    shutter: {
      serviceUuid: "00030000-0000-1000-0000-d8492fffa821",
      characteristicUuid: "00030030-0000-1000-0000-d8492fffa821",
      press: [[0x00, 0x01]],
      release: [[0x00, 0x02]]
    }
  },
  fujifilm_basic: {
    brand: "Fujifilm",
    transport: "BLE GATT token pairing",
    validation: "upstream-only",
    companyId: FUJIFILM_COMPANY_ID,
    manufacturerDataLength: 7,
    manufacturerType: 0x02,
    advertisedServiceUuids: [
      "af854c2e-b214-458e-97e2-912c4ecf2cb8",
      "117c4142-edd4-4c77-8696-dd18eebb770a"
    ],
    pairing: { security: "4-byte token from manufacturer data" },
    shutter: {
      serviceUuid: "6514eb81-4e8f-458d-aa2a-e691336cdfac",
      characteristicUuid: "7fcf49c6-4ff0-4777-a03d-1a79166af7a8",
      press: [[0x01, 0x00], [0x02, 0x00]],
      release: [[0x01, 0x00], [0x00, 0x00]]
    }
  },
  fujifilm_secure: {
    brand: "Fujifilm",
    transport: "BLE GATT secure pairing",
    validation: "upstream-only",
    companyId: FUJIFILM_COMPANY_ID,
    manufacturerDataLength: 8,
    advertisedServiceUuids: ["a9d2b304-e8d6-4902-8336-352b772d7597"],
    pairing: { security: "bonded secure connection plus Fujifilm status handshake" },
    shutter: {
      serviceUuid: "6514eb81-4e8f-458d-aa2a-e691336cdfac",
      characteristicUuid: "7fcf49c6-4ff0-4777-a03d-1a79166af7a8",
      press: [[0x01, 0x00], [0x02, 0x00]],
      release: [[0x01, 0x00], [0x00, 0x00]]
    }
  },
  nikon_ml_l7: {
    brand: "Nikon",
    transport: "BLE GATT remote mode",
    validation: "upstream-only",
    advertisedServiceUuids: [NIKON_SERVICE_UUID],
    pairing: { security: "Nikon four-stage remote handshake" },
    shutter: {
      serviceUuid: NIKON_SERVICE_UUID,
      characteristicUuid: "00002083-3dd4-4255-8d62-6dc7b9bd5561",
      press: [[0x02, 0x02]],
      release: [[0x02, 0x00]]
    }
  },
  ricoh_gr: {
    brand: "Ricoh/Pentax",
    transport: "BLE GATT camera API",
    validation: "catalog-only",
    advertisedServiceUuids: [
      "9a5ed1c5-74cc-4c50-b5b6-66a48e7ccff1",
      "4b445988-caa0-4dd3-941d-37b4f52aca86",
      "9f00f387-8345-4bbc-8b92-b87b52e3091a",
      "0f291746-0c80-4726-87a7-3c501fd3b4b6"
    ],
    pairing: { security: "LE Secure Connections with numeric comparison" },
    shutter: {
      serviceUuid: "9f00f387-8345-4bbc-8b92-b87b52e3091a",
      setupCharacteristicUuid: "b29e6de3-1aec-48c1-9d05-02cea57ce664",
      setup: [[0x00]],
      characteristicUuid: "559644b8-e0bc-4011-929b-5cf9199851e7",
      press: [[0x01, 0x01]],
      release: []
    }
  }
});

export function identifyCameraAdvertisement(advertisement) {
  const services = new Set((advertisement.serviceUuids ?? []).map(normalizeUuid));
  const manufacturerData = toBytes(advertisement.manufacturerData ?? []);
  const name = String(advertisement.name ?? "").toUpperCase();

  const exactServiceMatch = (id) =>
    CAMERA_BLE_PROTOCOLS[id].advertisedServiceUuids.some((uuid) => services.has(uuid));

  if (exactServiceMatch("canon_br_e1")) return match("canon_br_e1", "advertised service UUID");
  if (exactServiceMatch("canon_smart")) return match("canon_smart", "advertised service UUID");

  const companyId = manufacturerData.length >= 2
    ? manufacturerData[0] | (manufacturerData[1] << 8)
    : null;
  if (companyId === FUJIFILM_COMPANY_ID) {
    if (manufacturerData.length === 7 && manufacturerData[2] === 0x02
        && exactServiceMatch("fujifilm_basic")) {
      return match("fujifilm_basic", "company ID, token payload, and service UUID");
    }
    if (manufacturerData.length === 8 && exactServiceMatch("fujifilm_secure")) {
      return match("fujifilm_secure", "company ID, serial payload, and service UUID");
    }
  }

  if (manufacturerData.length === 0 && exactServiceMatch("nikon_ml_l7")) {
    return match("nikon_ml_l7", "service UUID with no manufacturer data");
  }

  if (exactServiceMatch("ricoh_gr") || /RICOH|PENTAX|GRIII|GR III|^GR$/.test(name)) {
    return match("ricoh_gr", exactServiceMatch("ricoh_gr") ? "advertised service UUID" : "device name heuristic");
  }

  return null;
}

export function getShutterWrites(protocolId) {
  const protocol = CAMERA_BLE_PROTOCOLS[protocolId];
  if (!protocol) throw new Error(`Unknown camera BLE protocol: ${protocolId}`);
  return {
    serviceUuid: protocol.shutter.serviceUuid,
    characteristicUuid: protocol.shutter.characteristicUuid,
    setup: protocol.shutter.setup ?? [],
    press: protocol.shutter.press,
    release: protocol.shutter.release
  };
}

function match(protocolId, evidence) {
  return { protocolId, evidence, validation: CAMERA_BLE_PROTOCOLS[protocolId].validation };
}

function normalizeUuid(value) {
  return String(value).trim().toLowerCase();
}

function toBytes(value) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value);
  const hex = String(value).replace(/[^0-9a-f]/gi, "");
  if (hex.length % 2 !== 0) throw new Error("Manufacturer data must contain complete bytes");
  return Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object" && !Object.isFrozen(child)) deepFreeze(child);
  }
  return value;
}
