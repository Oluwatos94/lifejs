import superjson from "superjson";
import { z } from "zod";

// - Primitive types
const serializablePrimitivesSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
  z.bigint(),
  z.date(),
  z.instanceof(RegExp),
  z.instanceof(Error),
  z.instanceof(URL),
  z.instanceof(ArrayBuffer),
  z.instanceof(Int8Array),
  z.instanceof(Uint8Array),
  z.instanceof(Uint8ClampedArray),
  z.instanceof(Int16Array),
  z.instanceof(Uint16Array),
  z.instanceof(Int32Array),
  z.instanceof(Uint32Array),
  z.instanceof(Float32Array),
  z.instanceof(Float64Array),
  z.instanceof(BigInt64Array),
  z.instanceof(BigUint64Array),
]);
type SerializablePrimitives = z.infer<typeof serializablePrimitivesSchema>;

// Collections and recursive types
export const serializableValueSchema: z.ZodType<SerializableValue> = z.lazy(() =>
  z.union([
    serializablePrimitivesSchema,
    z.array(serializableValueSchema),
    z.set(serializableValueSchema),
    z.map(z.any(), serializableValueSchema),
    z.record(z.string(), serializableValueSchema),
  ]),
);
export type SerializableValue =
  | SerializablePrimitives
  | SerializableValue[]
  | Set<SerializableValue>
  | Map<SerializableValue, SerializableValue>
  | { [key: string]: SerializableValue };

// Serialize and deserialize functions using SuperJSON
export const serialize = (value: SerializableValue): string => {
  return superjson.stringify(value);
};

export const deserialize = <T extends SerializableValue = SerializableValue>(value: string): T => {
  return superjson.parse<T>(value);
};
