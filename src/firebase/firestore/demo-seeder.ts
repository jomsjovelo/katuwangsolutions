import { initializeFirebase } from '../index';
import { collection, doc, writeBatch, getDocs, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface SeedProduct {
  name: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
}

const MODULE_SEED_DATA: Record<string, SeedProduct[]> = {
  'benta-snap': [
    { name: 'Kopiko Blanca 10s', price: 1500, cost: 1200, stock: 50, minStock: 10 },
    { name: 'Instant Noodles (Spicy)', price: 1800, cost: 1500, stock: 100, minStock: 20 },
    { name: 'Canned Corned Beef', price: 4500, cost: 3800, stock: 30, minStock: 15 },
    { name: 'Safeguard White 130g', price: 4000, cost: 3500, stock: 45, minStock: 10 },
    { name: '1.5L Coke', price: 7500, cost: 6500, stock: 20, minStock: 5 },
  ],
  'fresh-tally': [
    { name: 'Fresh Cabbage (1kg)', price: 8000, cost: 5000, stock: 15, minStock: 5 },
    { name: 'Sweet Mangoes (1kg)', price: 15000, cost: 10000, stock: 20, minStock: 10 },
    { name: 'Pork Belly (1kg)', price: 32000, cost: 28000, stock: 10, minStock: 5 },
    { name: 'White Onions (1kg)', price: 12000, cost: 8000, stock: 25, minStock: 10 },
    { name: 'Tomatoes (1kg)', price: 6000, cost: 4000, stock: 30, minStock: 10 },
  ],
  'build-stack': [
    { name: 'Portland Cement (40kg)', price: 25000, cost: 22000, stock: 100, minStock: 20 },
    { name: 'Marine Plywood 1/2', price: 65000, cost: 58000, stock: 50, minStock: 10 },
    { name: 'Common Nails 2"', price: 8000, cost: 6000, stock: 200, minStock: 50 },
    { name: 'PVC Pipe 2"', price: 18000, cost: 15000, stock: 80, minStock: 20 },
    { name: 'Paint Roller 7"', price: 12000, cost: 9000, stock: 40, minStock: 10 },
  ],
  '5-6-tracker': [
    { name: 'Personal Loan - Setup Fee', price: 50000, cost: 0, stock: 999, minStock: 0 },
    { name: 'Business Loan - Setup Fee', price: 150000, cost: 0, stock: 999, minStock: 0 },
    { name: 'Late Payment Penalty', price: 20000, cost: 0, stock: 999, minStock: 0 },
  ],
  'ledger-flow': [
    { name: 'Consultation Fee (1hr)', price: 150000, cost: 0, stock: 999, minStock: 0 },
    { name: 'Document Prep Fee', price: 80000, cost: 0, stock: 999, minStock: 0 },
    { name: 'Audit Service (Basic)', price: 500000, cost: 0, stock: 999, minStock: 0 },
  ],
  'sahod-flow': [
    { name: 'Cash Advance (Vales)', price: 100000, cost: 100000, stock: 999, minStock: 0 },
    { name: 'Uniform Deduction', price: 50000, cost: 50000, stock: 999, minStock: 0 },
    { name: 'ID Replacement Fee', price: 15000, cost: 10000, stock: 999, minStock: 0 },
  ],
  'biyahe-sync': [
    { name: 'Delivery Fee (Metro)', price: 15000, cost: 8000, stock: 999, minStock: 0 },
    { name: 'Delivery Fee (Provincial)', price: 35000, cost: 20000, stock: 999, minStock: 0 },
    { name: 'Passenger Ticket (Regular)', price: 50000, cost: 25000, stock: 999, minStock: 0 },
    { name: 'Cargo Fee (per kg)', price: 5000, cost: 2000, stock: 999, minStock: 0 },
  ],
  'farm-master': [
    { name: 'Urea Fertilizer (50kg)', price: 180000, cost: 160000, stock: 40, minStock: 10 },
    { name: 'Hybrid Corn Seeds (5kg)', price: 350000, cost: 300000, stock: 20, minStock: 5 },
    { name: 'Pesticide (1L)', price: 85000, cost: 70000, stock: 30, minStock: 10 },
    { name: 'Chicken Feed (50kg)', price: 150000, cost: 135000, stock: 50, minStock: 15 },
  ],
  'bite-snap': [
    { name: 'Pork Sisig w/ Egg', price: 18000, cost: 10000, stock: 999, minStock: 0 },
    { name: 'Chicken Inasal Combo', price: 22000, cost: 12000, stock: 999, minStock: 0 },
    { name: 'Garlic Rice', price: 4000, cost: 1500, stock: 999, minStock: 0 },
    { name: 'Lechon Kawali Meal', price: 25000, cost: 14000, stock: 999, minStock: 0 },
    { name: 'Iced Tea (Pitcher)', price: 9000, cost: 3000, stock: 999, minStock: 0 },
  ],
  'timpla-track': [
    { name: 'Iced Caramel Macchiato', price: 16000, cost: 6000, stock: 999, minStock: 0 },
    { name: 'Hot Cafe Latte', price: 14000, cost: 5000, stock: 999, minStock: 0 },
    { name: 'Matcha Frappe', price: 18000, cost: 7000, stock: 999, minStock: 0 },
    { name: 'Blueberry Cheesecake (Slice)', price: 15000, cost: 8000, stock: 12, minStock: 4 },
    { name: 'Chocolate Chip Cookie', price: 6000, cost: 2500, stock: 24, minStock: 10 },
  ],
  'ganap-master': [
    { name: 'Basic Catering (Per Pax)', price: 45000, cost: 25000, stock: 999, minStock: 0 },
    { name: 'Premium Sound System', price: 500000, cost: 100000, stock: 2, minStock: 1 },
    { name: 'Photo/Video Package', price: 1500000, cost: 500000, stock: 999, minStock: 0 },
    { name: 'Event Hosting Fee', price: 300000, cost: 0, stock: 999, minStock: 0 },
  ],
  'spin-snap': [
    { name: 'Wash & Fold (per kg)', price: 3500, cost: 1000, stock: 999, minStock: 0 },
    { name: 'Comforter (Queen/King)', price: 25000, cost: 5000, stock: 999, minStock: 0 },
    { name: 'Dry Cleaning (Suit)', price: 45000, cost: 15000, stock: 999, minStock: 0 },
    { name: 'Fabric Conditioner Add-on', price: 2000, cost: 500, stock: 999, minStock: 0 },
    { name: 'Detergent Powder (1kg)', price: 8000, cost: 5000, stock: 30, minStock: 10 },
  ],
  'hydro-sync': [
    { name: '5 Gallon Round (Refill)', price: 3500, cost: 500, stock: 999, minStock: 0 },
    { name: '5 Gallon Slim (Refill)', price: 3500, cost: 500, stock: 999, minStock: 0 },
    { name: 'New 5 Gallon Container', price: 15000, cost: 10000, stock: 50, minStock: 20 },
    { name: 'Hot/Cold Dispenser', price: 120000, cost: 90000, stock: 5, minStock: 2 },
  ],
  'auto-boss': [
    { name: 'Basic Car Wash', price: 15000, cost: 3000, stock: 999, minStock: 0 },
    { name: 'Premium Wax & Detailing', price: 80000, cost: 15000, stock: 999, minStock: 0 },
    { name: 'Engine Wash', price: 35000, cost: 8000, stock: 999, minStock: 0 },
    { name: 'Fully Synthetic Oil (1L)', price: 60000, cost: 45000, stock: 24, minStock: 8 },
    { name: 'Oil Filter Replacement', price: 40000, cost: 25000, stock: 15, minStock: 5 },
  ],
  'wellness-pro': [
    { name: 'Swedish Massage (1hr)', price: 50000, cost: 20000, stock: 999, minStock: 0 },
    { name: 'Deep Tissue Massage (1hr)', price: 70000, cost: 25000, stock: 999, minStock: 0 },
    { name: 'Basic Facial Treatment', price: 60000, cost: 15000, stock: 999, minStock: 0 },
    { name: 'Lavender Essential Oil (10ml)', price: 35000, cost: 15000, stock: 20, minStock: 5 },
    { name: 'Himalayan Salt Scrub', price: 45000, cost: 20000, stock: 15, minStock: 5 },
  ],
  'trim-track': [
    { name: 'Classic Haircut', price: 20000, cost: 5000, stock: 999, minStock: 0 },
    { name: 'Fade + Beard Trim', price: 35000, cost: 8000, stock: 999, minStock: 0 },
    { name: 'Hair Color Treatment', price: 80000, cost: 30000, stock: 999, minStock: 0 },
    { name: 'Matte Pomade (100g)', price: 45000, cost: 25000, stock: 20, minStock: 5 },
    { name: 'Beard Oil (30ml)', price: 35000, cost: 15000, stock: 15, minStock: 5 },
  ],
  'rep-sync': [
    { name: 'Monthly Membership', price: 100000, cost: 10000, stock: 999, minStock: 0 },
    { name: 'Daily Walk-in Rate', price: 10000, cost: 1000, stock: 999, minStock: 0 },
    { name: 'Personal Training (1 Session)', price: 50000, cost: 40000, stock: 999, minStock: 0 },
    { name: 'Whey Protein (1 Scoop)', price: 6000, cost: 3000, stock: 999, minStock: 0 },
    { name: 'Bottled Water (500ml)', price: 2500, cost: 1000, stock: 100, minStock: 20 },
  ],
  'rental': [
    { name: 'Monoblock Chair (Per Day)', price: 1000, cost: 0, stock: 200, minStock: 50 },
    { name: 'Round Table 10-seater (Per Day)', price: 15000, cost: 0, stock: 20, minStock: 5 },
    { name: 'Videoke Machine (Per Day)', price: 80000, cost: 0, stock: 5, minStock: 1 },
    { name: 'Chafing Dish (Per Day)', price: 25000, cost: 0, stock: 15, minStock: 5 },
    { name: 'Event Tent 3x3m (Per Day)', price: 100000, cost: 0, stock: 10, minStock: 2 },
  ],
};

let isSeeding = false;

export async function seedDemoAccountIfNeeded(tenantId: string, moduleType: string, authUid: string) {
  if (isSeeding || !tenantId.startsWith('demo_')) return;
  
    const { db } = initializeFirebase();
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const actualUid = auth.currentUser?.uid || authUid;
  
  try {
    isSeeding = true;
    
    // Check if tenant exists. If it does, we assume it's already seeded.
    // We do this instead of checking products to avoid permission errors
    // since we haven't created the tenant document (and thus ownerUid) yet!
    const tenantRef = doc(db, 'tenants', tenantId);
    const tenantSnap = await getDoc(tenantRef);
    
    if (tenantSnap.exists()) {
      isSeeding = false;
      return; // Already seeded
    }
    
    console.log(`[DemoSeeder] Seeding module: ${moduleType} for tenant: ${tenantId}...`);
    
    // First, create the tenant document itself so Firestore Rules pass for subcollections
    await setDoc(tenantRef, {
      name: `Demo - ${moduleType.replace('-', ' ').toUpperCase()}`,
      moduleType,
      ownerUid: actualUid, // Allow current user to read/write!
      createdAt: serverTimestamp(),
    }, { merge: true });
    
    if (moduleType === 'tsek-in') {
      const mockRooms = [
        { roomNumber: '101', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Available' },
        { roomNumber: '102', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Occupied' },
        { roomNumber: '103', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Cleaning' },
        { roomNumber: '201', type: 'Deluxe', rate: 2500, capacity: 3, bedType: '1 Queen, 1 Single', status: 'Available' },
        { roomNumber: '202', type: 'Deluxe', rate: 2500, capacity: 3, bedType: '1 Queen, 1 Single', status: 'Available' },
        { roomNumber: '301', type: 'Suite', rate: 4500, capacity: 4, bedType: '2 Queens', status: 'Available' },
        { roomNumber: 'Villa A', type: 'Villa', rate: 8000, capacity: 6, bedType: '3 Queens', status: 'Available' }
      ];
      const roomsBatch = writeBatch(db);
      const roomsRef = collection(db, 'tenants', tenantId, 'rooms');
      mockRooms.forEach((room) => {
        const newRoomRef = doc(roomsRef);
        roomsBatch.set(newRoomRef, {
          id: newRoomRef.id,
          ...room,
          createdAt: serverTimestamp(),
        });
      });
      await roomsBatch.commit();
      console.log(`[DemoSeeder] Successfully seeded ${mockRooms.length} rooms for Tsek-In.`);
    } else {
      // Seed products
      const seedProducts = MODULE_SEED_DATA[moduleType] || MODULE_SEED_DATA['benta-snap'];
      const batch = writeBatch(db);
      
      const productsRef = collection(db, 'tenants', tenantId, 'products');
      
      seedProducts.forEach((prod) => {
        const newProdRef = doc(productsRef);
        batch.set(newProdRef, {
          tenantId,
          name: prod.name,
          salePrice: prod.price,
          costPrice: prod.cost,
          currentStock: prod.stock,
          minStock: prod.minStock,
          isActive: true,
          category: 'General',
          unit: 'pcs',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      
      await batch.commit();
      console.log(`[DemoSeeder] Successfully seeded ${seedProducts.length} items for ${moduleType}.`);
      
      // Seed some recent sales to make the dashboard look alive
      const salesRef = collection(db, 'tenants', tenantId, 'sales');
      const salesBatch = writeBatch(db);
      
      // Create 3 recent sales using random products from the seed data
      for (let i = 0; i < 3; i++) {
        const randomProd = seedProducts[Math.floor(Math.random() * seedProducts.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const totalAmount = randomProd.price * qty;
        
        const newSaleRef = doc(salesRef);
        salesBatch.set(newSaleRef, {
          tenantId,
          productId: 'demo-prod-' + i,
          productName: randomProd.name,
          unitPrice: randomProd.price,
          quantity: qty,
          totalAmount,
          paymentMethod: 'cash',
          status: 'paid',
          performedBy: actualUid,
          // Randomize time within the last 24 hours
          createdAt: new Date(Date.now() - Math.random() * 86400000), 
        });
      }
      
      await salesBatch.commit();
      console.log(`[DemoSeeder] Successfully seeded sales for ${moduleType}.`);
    }
  } catch (error) {
    console.error('[DemoSeeder] Seeding failed:', error);
  } finally {
    isSeeding = false;
  }
}
