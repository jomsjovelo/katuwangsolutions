import { 
  FirestoreDataConverter, 
  DocumentData, 
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { z } from 'zod';

/**
 * Creates a strongly typed FirestoreDataConverter backed by a Zod schema.
 * 
 * - toFirestore: Validates data against the Zod schema before writing.
 * - fromFirestore: Gracefully parses data with safeParse. If validation fails,
 *   it logs a descriptive warning and falls back to casted data to prevent UI crashes.
 * 
 * @param schema Zod schema representing the document structure
 * @param strict If true, throws an error on read validation failure. Default is false.
 */
export function createConverter<T extends z.ZodObject<any>>(
  schema: T, 
  strict = false
): FirestoreDataConverter<z.infer<T>> {
  return {
    toFirestore(modelObject: z.infer<T>): DocumentData {
      // Exclude 'id' field from Firestore document body if it exists
      const { id, ...data } = modelObject;
      return schema.parse(data);
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): z.infer<T> {
      const data = snapshot.data();
      const parsed = schema.safeParse(data);
      
      if (!parsed.success) {
        console.error(
          `[Firestore Zod Validation Failed] 
          Collection: ${snapshot.ref.parent.path}
          Document ID: ${snapshot.id}
          Errors:`, 
          parsed.error.format()
        );
        
        if (strict) {
          throw new Error(`Data validation failed for document ${snapshot.id}`);
        }
        
        // Graceful degradation: return parsed data casted, preserving raw values to keep app running
        return { id: snapshot.id, ...data } as z.infer<T>;
      }
      
      return { id: snapshot.id, ...parsed.data };
    }
  };
}
