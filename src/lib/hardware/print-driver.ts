/**
 * Web Bluetooth ESC/POS Universal Thermal Print Driver
 * Tailored for standard 58mm & 80mm Bluetooth mobile thermal printers
 * Compatible with Goojprt, Xprinter, Netum, MPT-II, PT-210, RPP02N, ZJiang ZJ-5805, etc.
 */

export class EscPosBluetoothDriver {
  private static cachedDevice: any = null;
  private static cachedCharacteristic: any = null;
  private static isPrinting = false;

  // Standard ESC/POS binary codes
  private static ESC = 0x1B;
  private static GS = 0x1D;
  private static LF = 0x0A;

  // Formatting byte blocks
  private static INIT_PRINTER = new Uint8Array([EscPosBluetoothDriver.ESC, 0x40]);
  private static ALIGN_LEFT = new Uint8Array([EscPosBluetoothDriver.ESC, 0x61, 0x00]);
  private static ALIGN_CENTER = new Uint8Array([EscPosBluetoothDriver.ESC, 0x61, 0x01]);
  private static ALIGN_RIGHT = new Uint8Array([EscPosBluetoothDriver.ESC, 0x61, 0x02]);
  
  private static TEXT_SIZE_DOUBLE = new Uint8Array([EscPosBluetoothDriver.GS, 0x21, 0x11]); // Double width & height
  private static TEXT_SIZE_NORMAL = new Uint8Array([EscPosBluetoothDriver.GS, 0x21, 0x00]); // Normal

  private static PAPER_CUT = new Uint8Array([
    EscPosBluetoothDriver.LF, 
    EscPosBluetoothDriver.LF, 
    EscPosBluetoothDriver.LF,
    EscPosBluetoothDriver.GS, 
    0x56, 0x42, 0x00 // Paper Feed and Cut
  ]);

  // Comprehensive list of GATT service UUIDs used by standard and OEM thermal printer chips
  private static KNOWN_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', // Standard BLE Print
    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / Goojprt / Xprinter / POS-58
    '0000ff00-0000-1000-8000-00805f9b34fb', // OEM Chinese Thermal Printers
    '00004953-0000-1000-8000-00805f9b34fb', // MPT-II / Rongta / ISSC
    '0000ae30-0000-1000-8000-00805f9b34fb', // ZJiang / ZJ-5805 / Milstone
    '0000af30-0000-1000-8000-00805f9b34fb',
    '0000e701-0000-1000-8000-00805f9b34fb',
    '000018f1-0000-1000-8000-00805f9b34fb'
  ];

  /**
   * Check if active Bluetooth printer connection is alive
   */
  static isConnected(): boolean {
    return !!(
      EscPosBluetoothDriver.cachedDevice &&
      EscPosBluetoothDriver.cachedDevice.gatt &&
      EscPosBluetoothDriver.cachedDevice.gatt.connected &&
      EscPosBluetoothDriver.cachedCharacteristic
    );
  }

  /**
   * Get name of currently connected printer device or previously paired device
   */
  static getConnectedDeviceName(): string | null {
    if (EscPosBluetoothDriver.cachedDevice?.name) {
      return EscPosBluetoothDriver.cachedDevice.name;
    }
    if (typeof window !== 'undefined') {
      return localStorage.getItem('katuwang_bt_device_name') || null;
    }
    return null;
  }

  /**
   * Disconnect current active printer
   */
  static disconnect(): void {
    try {
      if (EscPosBluetoothDriver.cachedDevice?.gatt?.connected) {
        EscPosBluetoothDriver.cachedDevice.gatt.disconnect();
      }
    } catch (e) {
      console.warn("Error disconnecting printer", e);
    } finally {
      EscPosBluetoothDriver.cachedDevice = null;
      EscPosBluetoothDriver.cachedCharacteristic = null;
    }
  }

  /**
   * Helper to bind GATT server and discover printable characteristic
   */
  private async setupGattConnection(device: any): Promise<boolean> {
    console.log(`Connecting to GATT Server of: ${device.name || 'Bluetooth Printer'}...`);
    const server = await device.gatt.connect();

    console.log("Scanning available Bluetooth GATT services...");
    let targetCharacteristic: any = null;

    for (const serviceUuid of EscPosBluetoothDriver.KNOWN_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        const found = characteristics.find(
          (c: any) => c.properties.write || c.properties.writeWithoutResponse
        );
        if (found) {
          targetCharacteristic = found;
          console.log(`Matched printing characteristic in service: ${serviceUuid}`);
          break;
        }
      } catch (err) {
        // Continue scanning next service
      }
    }

    if (!targetCharacteristic) {
      try {
        const allServices = await server.getPrimaryServices();
        for (const s of allServices) {
          try {
            const characteristics = await s.getCharacteristics();
            const found = characteristics.find(
              (c: any) => c.properties.write || c.properties.writeWithoutResponse
            );
            if (found) {
              targetCharacteristic = found;
              console.log(`Matched printing characteristic in fallback service: ${s.uuid}`);
              break;
            }
          } catch (err) {
            // Ignore
          }
        }
      } catch (err) {
        console.warn("Could not inspect all primary services", err);
      }
    }

    if (!targetCharacteristic) {
      throw new Error("Walang nakitang writeable printing service sa Bluetooth printer. Pakisiguradong bukas at naka-pair ang POS printer.");
    }

    EscPosBluetoothDriver.cachedDevice = device;
    EscPosBluetoothDriver.cachedCharacteristic = targetCharacteristic;

    if (typeof window !== 'undefined' && device.name) {
      localStorage.setItem('katuwang_bt_device_name', device.name);
      if (device.id) localStorage.setItem('katuwang_bt_device_id', device.id);
    }

    device.addEventListener('gattserverdisconnected', () => {
      console.warn("Bluetooth printer disconnected");
      EscPosBluetoothDriver.cachedCharacteristic = null;
    });

    return true;
  }

  /**
   * Attempt silent auto-reconnect to a previously paired printer
   */
  async tryAutoReconnect(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !(navigator as any).bluetooth) return false;
      
      // If cachedDevice exists but disconnected, try connecting GATT directly
      if (EscPosBluetoothDriver.cachedDevice && !EscPosBluetoothDriver.isConnected()) {
        await this.setupGattConnection(EscPosBluetoothDriver.cachedDevice);
        return true;
      }

      // If browser supports getDevices(), attempt silent reconnect to saved device ID
      if (typeof (navigator as any).bluetooth.getDevices === 'function') {
        const savedId = localStorage.getItem('katuwang_bt_device_id');
        const devices = await (navigator as any).bluetooth.getDevices();
        if (devices && devices.length > 0) {
          const match = savedId ? devices.find((d: any) => d.id === savedId) : devices[0];
          if (match) {
            await this.setupGattConnection(match);
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("Auto-reconnect silent attempt failed:", e);
    }
    return false;
  }

  /**
   * Connect to a Bluetooth POS Thermal Printer with universal discovery & auto-fallback
   */
  async connect(forceReconnect = false): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !(navigator as any).bluetooth) {
        throw new Error("Web Bluetooth ay hindi suportado sa browser na ito. Mangyaring gamitin ang Google Chrome sa Android o Desktop.");
      }

      // Reuse active GATT connection if available and not forced
      if (!forceReconnect && EscPosBluetoothDriver.isConnected()) {
        console.log(`Reusing active connection to: ${EscPosBluetoothDriver.cachedDevice.name}`);
        return true;
      }

      // Attempt silent auto-reconnect first if not forcing new picker
      if (!forceReconnect) {
        const reconnected = await this.tryAutoReconnect();
        if (reconnected) return true;
      }

      console.log("Requesting Web Bluetooth Thermal Printer (Universal Mode)...");

      // Request device with acceptAllDevices: true so ALL nearby/paired printers appear in picker
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: EscPosBluetoothDriver.KNOWN_SERVICES
      });

      return await this.setupGattConnection(device);
    } catch (e: any) {
      console.error("Bluetooth printer connection failed", e);
      let friendlyMsg = e.message || "Bigo sa pag-connect sa Bluetooth printer.";
      if (e.name === 'NotFoundError' || friendlyMsg.includes('User cancelled')) {
        friendlyMsg = "Hindi itinuloy ang pagpili ng Bluetooth printer.";
      } else if (e.name === 'SecurityError' || e.name === 'NotAllowedError') {
        friendlyMsg = "Kailangan ng pahintulot sa Bluetooth ng browser/device.";
      } else if (e.name === 'NetworkError') {
        friendlyMsg = "Naputol ang koneksyon. Pakisiguradong bukas at malapit ang Bluetooth POS printer.";
      }
      throw new Error(friendlyMsg);
    }
  }

  /**
   * Convert plain text string into Uint8Array bytes (supporting simple ASCII/UTF-8)
   */
  private textToBytes(text: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  /**
   * Concatenate multiple Uint8Arrays together
   */
  private concatBytes(arrays: Uint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const arr of arrays) {
      totalLength += arr.length;
    }
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }

  /**
   * Formulates printable binary payload matching 58mm & 80mm POS receipt layout
   */
  formatReceipt(
    storeName: string,
    items: any[],
    totalAmountPesos: number,
    paymentMethod: string,
    transactionId?: string,
    subtotalAmountPesos?: number,
    discountAmountPesos?: number,
    discountType?: string
  ): Uint8Array {
    const byteChunks: Uint8Array[] = [];

    // 1. Initialize Printer
    byteChunks.push(EscPosBluetoothDriver.INIT_PRINTER);

    // 2. Centered Store Header
    byteChunks.push(EscPosBluetoothDriver.ALIGN_CENTER);
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_DOUBLE);
    byteChunks.push(this.textToBytes(`${storeName}\n`));
    
    // 3. Sub-headers
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_NORMAL);
    byteChunks.push(this.textToBytes("KATUWANG POS SYSTEM\n"));
    byteChunks.push(this.textToBytes("Ang Katuwang mo sa Negosyo\n"));
    byteChunks.push(this.textToBytes("--------------------------------\n")); // 32 chars wide for 58mm
    
    // 4. Receipt details
    byteChunks.push(EscPosBluetoothDriver.ALIGN_LEFT);
    const dateStr = new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
    byteChunks.push(this.textToBytes(`Petsa: ${dateStr}\n`));
    if (transactionId) {
      byteChunks.push(this.textToBytes(`Ref: ${transactionId.slice(0, 10).toUpperCase()}\n`));
    }
    byteChunks.push(this.textToBytes(`Bayad: ${paymentMethod.toUpperCase()}\n`));
    byteChunks.push(this.textToBytes("--------------------------------\n"));

    // 5. Items table
    byteChunks.push(this.textToBytes("Mga Produkto          Halaga\n"));
    items.forEach(item => {
      const name = item.name.length > 20 ? item.name.slice(0, 17) + "..." : item.name.padEnd(20);
      const priceStr = `P${(item.price / 100).toFixed(0)}`;
      const totalStr = `P${((item.price * item.quantity) / 100).toFixed(0)}`;
      const qtyText = `${item.quantity}x${priceStr}`.padEnd(10);
      byteChunks.push(this.textToBytes(`${name}\n`));
      byteChunks.push(this.textToBytes(`  ${qtyText} ${totalStr.padStart(8)}\n`));
    });
    
    byteChunks.push(this.textToBytes("--------------------------------\n"));

    // 6. Subtotal & Discount Breakdown (if discount applied)
    const itemsSum = items.reduce((sum, i) => sum + ((i.price * i.quantity) / 100), 0);
    const subtotal = subtotalAmountPesos || itemsSum;
    const discount = discountAmountPesos || (itemsSum > totalAmountPesos + 0.01 ? itemsSum - totalAmountPesos : 0);

    if (discount > 0) {
      byteChunks.push(EscPosBluetoothDriver.ALIGN_RIGHT);
      byteChunks.push(this.textToBytes(`SUBTOTAL: P${subtotal.toFixed(2)}\n`));
      byteChunks.push(this.textToBytes(`DISCOUNT${discountType ? ` (${discountType.toUpperCase()})` : ''}: -P${discount.toFixed(2)}\n`));
      byteChunks.push(this.textToBytes("--------------------------------\n"));
    }

    // 7. Net Total
    byteChunks.push(EscPosBluetoothDriver.ALIGN_RIGHT);
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_DOUBLE);
    byteChunks.push(this.textToBytes(`KABUUAN: P${totalAmountPesos.toFixed(2)}\n`));
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_NORMAL);
    
    // 8. Footer
    byteChunks.push(new Uint8Array([EscPosBluetoothDriver.LF]));
    byteChunks.push(EscPosBluetoothDriver.ALIGN_CENTER);
    byteChunks.push(this.textToBytes("Maraming Salamat Po!\n"));
    byteChunks.push(this.textToBytes("Salamat sa inyong pagtangkilik!\n"));
    byteChunks.push(this.textToBytes("Powered by Katuwang Solutions\n"));
    
    // 9. Feed & Cut
    byteChunks.push(EscPosBluetoothDriver.PAPER_CUT);

    return this.concatBytes(byteChunks);
  }

  /**
   * Generates a sample test receipt payload for testing printer functionality
   */
  formatTestReceipt(storeName: string): Uint8Array {
    return this.formatReceipt(
      storeName,
      [
        { name: "Test Product Item 1", quantity: 1, price: 5000 },
        { name: "Test Product Item 2", quantity: 2, price: 2500 }
      ],
      100,
      "CASH",
      "TEST-PRINT",
      100,
      0
    );
  }

  /**
   * Streams ESC/POS command buffers in chunks.
   * Auto-adjusts MTU: Tries 512 bytes for high-speed printing, falls back to 20 bytes for budget hardware.
   */
  async print(data: Uint8Array): Promise<void> {
    if (EscPosBluetoothDriver.isPrinting) {
      console.warn("Print stream is already active. Ignoring concurrent request.");
      throw new Error("Kasalukuyang nagpi-print. Mangyaring maghintay matapos ang print job.");
    }

    if (!EscPosBluetoothDriver.cachedCharacteristic) {
      throw new Error("Walang konektadong POS thermal printer. Mangyaring i-connect muna ang printer sa Printer Setup.");
    }

    try {
      EscPosBluetoothDriver.isPrinting = true;
      let chunkLimit = 512;
      let offset = 0;

      console.log(`Streaming ${data.length} bytes to thermal printer...`);

      while (offset < data.length) {
        const chunk = data.slice(offset, offset + chunkLimit);
        
        try {
          if (EscPosBluetoothDriver.cachedCharacteristic.properties.writeWithoutResponse) {
            await EscPosBluetoothDriver.cachedCharacteristic.writeValueWithoutResponse(chunk);
          } else {
            await EscPosBluetoothDriver.cachedCharacteristic.writeValueWithResponse(chunk);
          }
          offset += chunkLimit;
          // Brief sleep gap to prevent BLE hardware buffer overflows
          await new Promise(resolve => setTimeout(resolve, 15));
        } catch (e) {
          const error = e as Error & { code?: string };
          if (chunkLimit === 512) {
            console.warn("MTU limit hit. Falling back to safe 20-byte chunks.");
            chunkLimit = 20; // Fallback to standard BLE packet size
          } else {
            throw error;
          }
        }
      }

      console.log("ESC/POS print stream sent successfully!");
    } finally {
      EscPosBluetoothDriver.isPrinting = false;
    }
  }
}
