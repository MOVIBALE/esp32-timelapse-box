export function buildOpenOptions(value) {
  const baudRate = Number(value);
  if (!Number.isInteger(baudRate) || baudRate <= 0) {
    throw new Error("Invalid baud rate");
  }
  return { baudRate };
}

export function formatPortInfo(info) {
  if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined)) {
    return "Serial port selected. Chrome may hide USB identifiers for this adapter.";
  }

  const vid = info.usbVendorId === undefined ? "unknown" : `0x${info.usbVendorId.toString(16).padStart(4, "0")}`;
  const pid = info.usbProductId === undefined ? "unknown" : `0x${info.usbProductId.toString(16).padStart(4, "0")}`;
  return `USB VID ${vid} / PID ${pid}`;
}

export class BrowserSerialConnection {
  constructor(port) {
    this.port = port;
    this.reader = undefined;
    this.writer = undefined;
  }

  static async request(serialApi, baudRate = 115200) {
    const port = await serialApi.requestPort();
    await port.open(buildOpenOptions(baudRate));
    return new BrowserSerialConnection(port);
  }

  async write(text) {
    if (!this.port.writable) throw new Error("serial port is not writable");
    this.writer ??= this.port.writable.getWriter();
    await this.writer.write(new TextEncoder().encode(text));
  }

  async readChunk() {
    if (!this.port.readable) throw new Error("serial port is not readable");
    this.reader ??= this.port.readable.getReader();
    const result = await this.reader.read();
    if (result.done || !result.value) return "";
    return new TextDecoder().decode(result.value);
  }

  async cancelRead() {
    await this.reader?.cancel();
  }

  async close() {
    this.reader?.releaseLock();
    this.writer?.releaseLock();
    await this.port.close();
  }
}
