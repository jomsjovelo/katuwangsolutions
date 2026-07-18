import { initializeFirebase } from '../src/firebase/index';
import { addRoom } from '../src/firebase/firestore/tsek-in-actions';

async function seed() {
  const tenantId = 'demo'; // Standard demo tenant
  console.log('Seeding Tsek-In mock data for demo tenant...');
  
  const mockRooms = [
    { roomNumber: '101', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Available' as const },
    { roomNumber: '102', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Occupied' as const },
    { roomNumber: '103', type: 'Standard', rate: 1500, capacity: 2, bedType: '1 Queen', status: 'Cleaning' as const },
    { roomNumber: '201', type: 'Deluxe', rate: 2500, capacity: 3, bedType: '1 Queen, 1 Single', status: 'Available' as const },
    { roomNumber: '202', type: 'Deluxe', rate: 2500, capacity: 3, bedType: '1 Queen, 1 Single', status: 'Available' as const },
    { roomNumber: '301', type: 'Suite', rate: 4500, capacity: 4, bedType: '2 Queens', status: 'Available' as const },
    { roomNumber: 'Villa A', type: 'Villa', rate: 8000, capacity: 6, bedType: '3 Queens', status: 'Available' as const }
  ];

  for (const room of mockRooms) {
    try {
      await addRoom(tenantId, room);
      console.log(`Added room ${room.roomNumber}`);
    } catch (e) {
      console.error(`Failed to add room ${room.roomNumber}:`, e);
    }
  }
  
  console.log('Finished seeding Tsek-In demo data.');
  process.exit(0);
}

seed();
