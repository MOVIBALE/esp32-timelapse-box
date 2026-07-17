import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMERA_BLE_PROTOCOLS,
  FURBLE_REFERENCE,
  getShutterWrites,
  identifyCameraAdvertisement
} from "../tools/camera_ble_protocol_catalog.mjs";

test("protocol research is pinned to an auditable upstream revision", () => {
  assert.equal(FURBLE_REFERENCE.license, "MIT");
  assert.match(FURBLE_REFERENCE.commit, /^[0-9a-f]{40}$/);
  for (const protocol of Object.values(CAMERA_BLE_PROTOCOLS)) {
    assert.notEqual(protocol.validation, "hardware-validated");
  }
});

test("Canon remote and smart advertisements remain distinct", () => {
  assert.equal(identifyCameraAdvertisement({
    serviceUuids: ["00050000-0000-1000-0000-D8492FFFA821"]
  }).protocolId, "canon_br_e1");
  assert.equal(identifyCameraAdvertisement({
    serviceUuids: ["00010000-0000-1000-0000-d8492fffa821"]
  }).protocolId, "canon_smart");
  assert.deepEqual(getShutterWrites("canon_br_e1").press, [[0x8c]]);
  assert.deepEqual(getShutterWrites("canon_br_e1").release, [[0x0c]]);
});

test("Fujifilm basic requires token payload and secure requires serial payload", () => {
  const basic = identifyCameraAdvertisement({
    serviceUuids: ["af854c2e-b214-458e-97e2-912c4ecf2cb8"],
    manufacturerData: "d8040211223344"
  });
  const secure = identifyCameraAdvertisement({
    serviceUuids: ["a9d2b304-e8d6-4902-8336-352b772d7597"],
    manufacturerData: [0xd8, 0x04, 0x01, 1, 2, 3, 4, 5]
  });
  assert.equal(basic.protocolId, "fujifilm_basic");
  assert.equal(secure.protocolId, "fujifilm_secure");
  assert.equal(identifyCameraAdvertisement({
    serviceUuids: ["af854c2e-b214-458e-97e2-912c4ecf2cb8"],
    manufacturerData: "d80402112233"
  }), null);
  assert.deepEqual(getShutterWrites("fujifilm_secure").press,
    [[0x01, 0x00], [0x02, 0x00]]);
});

test("Nikon initial pairing advertisement has service UUID and no manufacturer data", () => {
  const pairing = identifyCameraAdvertisement({
    serviceUuids: ["0000de00-3dd4-4255-8d62-6dc7b9bd5561"]
  });
  assert.equal(pairing.protocolId, "nikon_ml_l7");
  assert.equal(identifyCameraAdvertisement({
    serviceUuids: ["0000de00-3dd4-4255-8d62-6dc7b9bd5561"],
    manufacturerData: [0x99, 0x03, 1, 2, 3, 4, 0]
  }), null);
  assert.deepEqual(getShutterWrites("nikon_ml_l7").press, [[0x02, 0x02]]);
  assert.deepEqual(getShutterWrites("nikon_ml_l7").release, [[0x02, 0x00]]);
});

test("Ricoh is catalog-only and supports service or conservative name recognition", () => {
  assert.equal(identifyCameraAdvertisement({ name: "RICOH GR III" }).protocolId, "ricoh_gr");
  assert.equal(identifyCameraAdvertisement({ name: "GRAND CAMERA" }), null);
  assert.equal(CAMERA_BLE_PROTOCOLS.ricoh_gr.validation, "catalog-only");
  assert.deepEqual(getShutterWrites("ricoh_gr").setup, [[0x00]]);
  assert.deepEqual(getShutterWrites("ricoh_gr").press, [[0x01, 0x01]]);
  assert.deepEqual(getShutterWrites("ricoh_gr").release, []);
});

test("unknown advertisements are not guessed", () => {
  assert.equal(identifyCameraAdvertisement({ name: "Camera", serviceUuids: [] }), null);
  assert.throws(() => getShutterWrites("unknown"), /Unknown camera BLE protocol/);
});
