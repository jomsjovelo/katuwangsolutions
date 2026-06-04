/**
 * Parses a CSV string into an array of objects.
 * Handles commas inside double quotes.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Parse headers
  const headers = lines[0]
    .split(',')
    .map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

  const results: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split by comma, ignoring commas inside quotes
    const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      let val = values[index] || '';
      // Remove wrapping quotes and trim
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      obj[header] = val.trim();
    });
    results.push(obj);
  }

  return results;
}
