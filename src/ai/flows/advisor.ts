import { z } from 'genkit';
import { ai } from '../genkit';
import { googleAI } from '@genkit-ai/google-genai';

// Input Schema for Katuwang AI Co-Pilot
const ProductInputSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  currentStock: z.number(),
  minStock: z.number(),
  salePrice: z.number(), // in centavos
  unit: z.string(),
});

const SaleInputSchema = z.object({
  totalAmount: z.number(), // in centavos
  paymentMethod: z.string(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    price: z.number(),
  })).optional(),
});

export const AdvisorInputSchema = z.object({
  tenantName: z.string(),
  moduleType: z.string(),
  products: z.array(ProductInputSchema),
  sales: z.array(SaleInputSchema),
  lowStockItems: z.array(ProductInputSchema),
  outOfStockItems: z.array(ProductInputSchema),
  dailyTotalPesos: z.number(),
});

// Structured Response Schema
export const AdvisorOutputSchema = z.object({
  advice: z.string().describe('Ang pangunahing advice at pampalakas-loob para kay Ate o Kuya sa mainit, magiliw, at propesyonal na Tagalog.'),
  keyAlerts: z.array(z.string()).describe('Mga kritikal na babala tungkol sa maubos o ubos na paninda.'),
  actionSteps: z.array(z.string()).describe('Listahan ng 2-3 na agarang aksyon na madaling gawin ng shopkeeper ngayon.'),
});

export const advisorFlow = ai.defineFlow({
  name: 'advisorFlow',
  inputSchema: AdvisorInputSchema,
  outputSchema: AdvisorOutputSchema,
}, async (input) => {
  const productsCount = input.products.length;
  const salesCount = input.sales.length;
  const lowStockCount = input.lowStockItems.length;
  const outOfStockCount = input.outOfStockItems.length;

  const prompt = `
Ikaw si **Katuwang AI**, ang pinagkakatiwalaan, maasahan, at matalinong AI Co-Pilot ng mga Filipino MSMEs (tulad ng mga may-ari ng sari-sari store, palengke stalls, local car wash, at maliliit na kainan).
Kausap mo si Ate o Kuya na may-ari ng shop na pinangalanang "${input.tenantName}", na gumagamit ng Katuwang module na "${input.moduleType}".

Narito ang kasalukuyang operational data ng kanilang negosyo:
- Kabuuang bilang ng magkakaibang produkto sa inventory: ${productsCount} items
- Bilang ng benta ngayong araw: ${salesCount} transaction(s)
- Kabuuang kita ngayong araw: ₱${input.dailyTotalPesos.toFixed(2)}
- Bilang ng panindang paubos na (Low Stock): ${lowStockCount} item(s)
- Bilang ng panindang ubos na (Out of Stock): ${outOfStockCount} item(s)

${lowStockCount > 0 ? `Mga paubos na produkto: ${input.lowStockItems.map(p => `${p.name} (Natitirang stock: ${p.currentStock} ${p.unit}, Minimum set: ${p.minStock} ${p.unit})`).join(', ')}` : ''}
${outOfStockCount > 0 ? `Mga ubos na produkto: ${input.outOfStockItems.map(p => p.name).join(', ')}` : ''}

Magbigay ng mainit, magiliw, magalang, at pampalakas-loob na pagsusuri at payo (Business Advice) na nakasulat sa natural at magalang na Tagalog/Taglish (gumamit ng "po" at "opo").
Gawin itong parang isang tapat na kaibigan at bihasang negosyante na tumutulong sa kanila sa araw-araw na pagpapatakbo ng tindahan.

Tiyaking ibalik ang iyong sagot sa JSON format na sumusunod sa output schema:
1. "advice": Isang paragraph na naglalaman ng pagsusuri sa kanilang kita at stock, pati na rin ang pagbati o pampalakas-loob sa kanilang sipag ngayong araw.
2. "keyAlerts": Array ng mga pangunahing babala tungkol sa inventory (hal. kung may critical items na ubos o paubos na). Kung wala, magbigay ng paalala sa tamang pag-iingat sa paninda.
3. "actionSteps": Array ng 2 hanggang 3 na praktikal, konkreto, at madaling sunding hakbang na maaari nilang gawin agad ngayon upang mapalago ang benta o maiwasan ang kawalan ng stock.
`;

  const response = await ai.generate({
    model: googleAI.model('gemini-2.5-flash'),
    prompt: prompt,
    config: {
      responseMimeType: 'application/json',
    }
  });

  try {
    // Parse the output to ensure it matches the schema structural expectations
    const parsed = JSON.parse(response.text);
    return AdvisorOutputSchema.parse(parsed);
  } catch (error) {
    console.error("Failed to parse AI output, falling back to structured representation:", response.text);
    return {
      advice: `Kumusta po, Ate/Kuya ng ${input.tenantName}! Ako po si Katuwang AI. Ngayong araw, mayroon po kayong kabuuang kita na ₱${input.dailyTotalPesos.toFixed(2)} mula sa ${salesCount} na benta. Napansin ko po na may ${lowStockCount} na produktong paubos at ${outOfStockCount} na ubos na. Patuloy po tayong magsumikap, nandito po ang Katuwang para umalalay sa inyo!`,
      keyAlerts: outOfStockCount > 0 ? [`May mga ubos na po kayong paninda.`] : [`Maayos po ang takbo ng inyong tindahan ngayong araw!`],
      actionSteps: [
        `Tingnan po ang listahan ng mga paubos na paninda at i-update ang stock.`,
        `Ipagpatuloy ang magandang serbisyo sa mga suki.`
      ]
    };
  }
});
