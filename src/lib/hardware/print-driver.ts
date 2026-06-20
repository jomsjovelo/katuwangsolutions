/**
 * Web Bluetooth ESC/POS Print Driver for Katuwang SaaS Ecosystem
 * Tailored for standard 58mm mobile thermal printers (80mm width printable boundary).
 */

export class EscPosBluetoothDriver {
  private device: any = null;
  private characteristic: any = null;
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

  /**
   * Request Bluetooth POS Printer device and connect
   */
  async connect(): Promise<boolean> {
    try {
      if (typeof window === 'undefined' || !(navigator as any).bluetooth) {
        throw new Error("Web Bluetooth ay hindi suportado sa browser na ito.");
      }

      console.log("Requesting Web Bluetooth POS Printer...");
      
      // Query standard BLE Bluetooth printing services
      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] }, // Standard BLE Print UUID
          { namePrefix: 'MPT' }, // common 58mm printers
          { namePrefix: 'POS' },
          { namePrefix: 'Printer' }
        ],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
      });

      console.log(`Connecting to GATT Server of: ${this.device.name}...`);
      const server = await this.device.gatt.connect();
      
      console.log("Fetching Bluetooth Printing Service...");
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      
      console.log("Fetching Printing Characteristic...");
      const characteristics = await service.getCharacteristics();
      
      // Look for a writeable characteristic
      this.characteristic = characteristics.find((c: any) => c.properties.write || c.properties.writeWithoutResponse);
      
      if (!this.characteristic) {
        throw new Error("Walang nakitang write-attribute sa printer service.");
      }

      console.log("Successfully connected to ESC/POS Thermal Printer!");
      return true;
    } catch (e: any) {
      console.error("Bluetooth printer connection failed", e);
      throw e;
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
   * Formulates printable binary payload matching narrow 58mm POS receipt layout
   */
  formatReceipt(
    storeName: string,
    items: any[],
    totalAmountPesos: number,
    paymentMethod: string,
    transactionId?: string
  ): Uint8Array {
    const byteChunks: Uint8Array[] = [];

    // 1. Initialize
    byteChunks.push(EscPosBluetoothDriver.INIT_PRINTER);

    // 2. Centered Bold Header
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

    // 5. Items list table
    // Layout: ITEM NAME (20 chars) | QTYxPRICE | TOTAL
    byteChunks.push(this.textToBytes("Mga Produkto          Halaga\n"));
    items.forEach(item => {
      const name = item.name.length > 20 ? item.name.slice(0, 17) + "..." : item.name.padEnd(20);
      const priceStr = `₱${(item.price / 100).toFixed(0)}`;
      const totalStr = `₱${((item.price * item.quantity) / 100).toFixed(0)}`;
      const qtyText = `${item.quantity}x${priceStr}`.padEnd(10);
      byteChunks.push(this.textToBytes(`${name}\n`));
      byteChunks.push(this.textToBytes(`  ${qtyText} ${totalStr.padStart(8)}\n`));
    });
    
    byteChunks.push(this.textToBytes("--------------------------------\n"));

    // 6. Net Total
    byteChunks.push(EscPosBluetoothDriver.ALIGN_RIGHT);
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_DOUBLE);
    byteChunks.push(this.textToBytes(`KABUUAN: ₱${totalAmountPesos.toFixed(2)}\n`));
    byteChunks.push(EscPosBluetoothDriver.TEXT_SIZE_NORMAL);
    
    // 7. Footer
    byteChunks.push(new Uint8Array([EscPosBluetoothDriver.LF]));
    byteChunks.push(EscPosBluetoothDriver.ALIGN_CENTER);
    byteChunks.push(this.textToBytes("Maraming Salamat Po!\n"));
    byteChunks.push(this.textToBytes("Salamat sa inyong pagtangkilik!\n"));
    byteChunks.push(this.textToBytes("Powered by Katuwang Solutions\n"));
    
    // 8. Feed & Cut
    byteChunks.push(EscPosBluetoothDriver.PAPER_CUT);

    return this.concatBytes(byteChunks);
  }

  /**
   * Streams ESC/POS command buffers in chunks.
   * Negotiates MTU: Attempts 512 bytes for fast printing, falls back to 20 bytes if device rejects.
   */
  async print(data: Uint8Array): Promise<void> {
    if (EscPosBluetoothDriver.isPrinting) {
      console.warn("Print stream is already active. Ignoring concurrent request.");
      throw new Error("Kasalukuyang nagpi-print. Mangyaring maghintay matapos ang print job.");
    }

    if (!this.characteristic) {
      throw new Error("Walang konektadong POS thermal printer.");
    }

    try {
      EscPosBluetoothDriver.isPrinting = true;
      let chunkLimit = 512; // Start with high MTU
      let offset = 0;

      console.log(`Streaming ${data.length} bytes to thermal printer...`);

      while (offset < data.length) {
        const chunk = data.slice(offset, offset + chunkLimit);
        
        try {
          if (this.characteristic.properties.writeWithoutResponse) {
            await this.characteristic.writeValueWithoutResponse(chunk);
          } else {
            await this.characteristic.writeValueWithResponse(chunk);
          }
          offset += chunkLimit;
          // Brief sleep gap to prevent BLE hardware buffer overflows
          await new Promise(resolve => setTimeout(resolve, 15));
        } catch (e) {
      const error = e as Error & { code?: string };
          if (chunkLimit === 512) {
            console.warn("MTU limit hit. Falling back to safe 20-byte chunks.");
            chunkLimit = 20; // fallback MTU
            // do not increment offset, retry this chunk
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
