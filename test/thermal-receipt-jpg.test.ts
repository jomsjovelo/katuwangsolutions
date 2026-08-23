import { test } from 'node:test';
import assert from 'node:assert';
import {
  sanitizeReceiptFilename,
  convertDataUrlToJpegBlob,
  downloadReceiptBlob,
  validateJpegBlob,
  writeJpegToFileHandle,
} from '../src/components/common/thermal-receipt-preview';

// Minimal valid JPEG: 1x1 white pixel (SOI 0xFF 0xD8 present)
const VALID_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP' +
  '//////////////////////////////////////////////////////////////////////////////////////' +
  'wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

test('Thermal Receipt Save as JPG - Focused Test Suite', async (t) => {

  // ── Filename sanitization ─────────────────────────────────────────────────

  await t.test('1. Sanitizes transaction ID into safe filename ending with .jpg', () => {
    const rawTxId = 'sale/123:abc-XYZ!@#';
    const filename = sanitizeReceiptFilename(rawTxId);
    assert.strictEqual(filename.endsWith('.jpg'), true, 'Filename must always end with .jpg');
    assert.strictEqual(filename, 'Receipt_sale_123_abc-XYZ___.jpg');
    assert.doesNotMatch(filename, /[/\\:?*"<>|!@#$]/, 'Unsafe characters must be sanitized');
  });

  await t.test('2. Default filename when transactionId is missing ends with .jpg', () => {
    const filename = sanitizeReceiptFilename();
    assert.strictEqual(filename.startsWith('Receipt_'), true);
    assert.strictEqual(filename.endsWith('.jpg'), true);
  });

  await t.test('3. Fallback downloadReceiptBlob enforces .jpg extension', () => {
    const validBlob = new Blob([new Uint8Array([0xFF, 0xD8, 0x01])], { type: 'image/jpeg' });
    assert.throws(
      () => downloadReceiptBlob(validBlob, 'Receipt_no_extension.png'),
      /Filename must end with \.jpg/,
      'Should reject filenames that do not end in .jpg'
    );
  });

  // ── JPEG Blob conversion ───────────────────────────────────────────────────

  await t.test('4. Converts JPEG data URL to valid non-empty Blob with image/jpeg MIME type', async () => {
    const blob = await convertDataUrlToJpegBlob(VALID_JPEG_DATA_URL);
    assert.ok(blob, 'Blob must exist');
    assert.ok(blob.size > 0, 'Blob must be non-empty');
    assert.strictEqual(blob.type, 'image/jpeg', 'MIME type must be image/jpeg');
  });

  await t.test('5. Rejects invalid or non-data-URL strings', async () => {
    await assert.rejects(
      () => convertDataUrlToJpegBlob(''),
      /Invalid image data URL/,
      'Should reject empty string'
    );
    await assert.rejects(
      () => convertDataUrlToJpegBlob('http://example.com/not-data-url'),
      /Invalid image data URL/,
      'Should reject non-data URLs'
    );
  });

  // ── validateJpegBlob ──────────────────────────────────────────────────────

  await t.test('6. validateJpegBlob passes for a valid JPEG blob (SOI marker present)', async () => {
    const blob = await convertDataUrlToJpegBlob(VALID_JPEG_DATA_URL);
    await assert.doesNotReject(
      () => validateJpegBlob(blob),
      'Valid JPEG blob must not throw'
    );
  });

  await t.test('7. validateJpegBlob rejects empty blob', async () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    await assert.rejects(
      () => validateJpegBlob(emptyBlob),
      /empty/,
      'Should reject empty blob'
    );
  });

  await t.test('8. validateJpegBlob rejects wrong MIME type', async () => {
    const htmlBlob = new Blob(['<html></html>'], { type: 'text/html' });
    await assert.rejects(
      () => validateJpegBlob(htmlBlob),
      /image\/jpeg/,
      'Should reject non-JPEG MIME type'
    );
  });

  await t.test('9. validateJpegBlob rejects blob with invalid JPEG header (PNG bytes)', async () => {
    // PNG SOI: 0x89 0x50 — not a JPEG 0xFF 0xD8
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    const fakeBlob = new Blob([pngHeader], { type: 'image/jpeg' });
    await assert.rejects(
      () => validateJpegBlob(fakeBlob),
      /SOI marker/,
      'Should reject blob whose first bytes are not the JPEG SOI marker'
    );
  });

  // ── writeJpegToFileHandle (FSA write helper) ─────────────────────────────

  await t.test('10. writeJpegToFileHandle writes blob and closes the stream', async () => {
    const blob = await convertDataUrlToJpegBlob(VALID_JPEG_DATA_URL);

    const written: Blob[] = [];
    let closed = false;
    const mockWritable = {
      write: async (b: Blob) => { written.push(b); },
      close: async () => { closed = true; },
      abort: async () => {},
    };
    const mockHandle = {
      createWritable: async () => mockWritable,
    } as unknown as FileSystemFileHandle;

    const result = await writeJpegToFileHandle(mockHandle, blob);

    assert.strictEqual(result, 'saved', 'Should return "saved"');
    assert.strictEqual(written.length, 1, 'Exactly one write call');
    assert.strictEqual(written[0], blob, 'The exact blob must be written');
    assert.strictEqual(closed, true, 'Writable stream must be closed');
  });

  await t.test('11. writeJpegToFileHandle aborts stream and rethrows on write error', async () => {
    const blob = await convertDataUrlToJpegBlob(VALID_JPEG_DATA_URL);

    let aborted = false;
    const mockWritable = {
      write: async () => { throw new Error('Disk full'); },
      close: async () => {},
      abort: async () => { aborted = true; },
    };
    const mockHandle = {
      createWritable: async () => mockWritable,
    } as unknown as FileSystemFileHandle;

    await assert.rejects(
      () => writeJpegToFileHandle(mockHandle, blob),
      /Disk full/,
      'Should rethrow the write error'
    );
    assert.strictEqual(aborted, true, 'Should call abort() to clean up the stream');
  });

  await t.test('12. writeJpegToFileHandle rejects empty blob without writing', async () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    let wroteAnything = false;
    const mockHandle = {
      createWritable: async () => ({
        write: async () => { wroteAnything = true; },
        close: async () => {},
        abort: async () => {},
      }),
    } as unknown as FileSystemFileHandle;

    await assert.rejects(
      () => writeJpegToFileHandle(mockHandle, emptyBlob),
      /empty/,
      'Should not write an empty blob'
    );
    assert.strictEqual(wroteAnything, false, 'createWritable should not be reached for empty blobs');
  });

  // ── Fallback empty-blob guard ─────────────────────────────────────────────

  await t.test('13. downloadReceiptBlob rejects empty Blob', () => {
    const emptyBlob = new Blob([], { type: 'image/jpeg' });
    assert.throws(
      () => downloadReceiptBlob(emptyBlob, 'test.jpg'),
      /Cannot download empty blob/
    );
  });
});
