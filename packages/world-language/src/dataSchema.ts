export interface DataValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type DataSchema =
  | { const: unknown }
  | { oneOf: DataSchema[] }
  | { type: 'string'; enum?: string[]; minLength?: number; maxLength?: number }
  | { type: 'number'; enum?: number[]; minimum?: number; maximum?: number; integer?: boolean }
  | { type: 'boolean' }
  | { type: 'array'; items: DataSchema; minItems?: number; maxItems?: number; uniqueItems?: boolean }
  | {
      type: 'object';
      properties: Record<string, DataSchema>;
      required?: string[];
      additionalProperties?: boolean;
    };

function primitiveEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function positiveInteger(value: number | undefined, label: string): void {
  if (value != null && (!Number.isInteger(value) || value < 0)) throw new Error(`${label} must be a non-negative integer.`);
}

export function assertDataSchema(schema: DataSchema, path = '$'): void {
  if ('const' in schema) return;
  if ('oneOf' in schema) {
    if (!Array.isArray(schema.oneOf) || schema.oneOf.length === 0) throw new Error(`${path}.oneOf must not be empty.`);
    schema.oneOf.forEach((entry, index) => assertDataSchema(entry, `${path}.oneOf[${index}]`));
    return;
  }
  if (schema.type === 'string') {
    positiveInteger(schema.minLength, `${path}.minLength`);
    positiveInteger(schema.maxLength, `${path}.maxLength`);
    if (schema.minLength != null && schema.maxLength != null && schema.minLength > schema.maxLength) {
      throw new Error(`${path} has minLength greater than maxLength.`);
    }
    if (schema.enum && (schema.enum.length === 0 || new Set(schema.enum).size !== schema.enum.length)) {
      throw new Error(`${path}.enum must contain unique values.`);
    }
    return;
  }
  if (schema.type === 'number') {
    if (schema.minimum != null && !Number.isFinite(schema.minimum)) throw new Error(`${path}.minimum must be finite.`);
    if (schema.maximum != null && !Number.isFinite(schema.maximum)) throw new Error(`${path}.maximum must be finite.`);
    if (schema.minimum != null && schema.maximum != null && schema.minimum > schema.maximum) {
      throw new Error(`${path} has minimum greater than maximum.`);
    }
    if (schema.enum && (schema.enum.length === 0 || schema.enum.some((value) => !Number.isFinite(value)))) {
      throw new Error(`${path}.enum must contain finite numbers.`);
    }
    return;
  }
  if (schema.type === 'boolean') return;
  if (schema.type === 'array') {
    positiveInteger(schema.minItems, `${path}.minItems`);
    positiveInteger(schema.maxItems, `${path}.maxItems`);
    if (schema.minItems != null && schema.maxItems != null && schema.minItems > schema.maxItems) {
      throw new Error(`${path} has minItems greater than maxItems.`);
    }
    assertDataSchema(schema.items, `${path}.items`);
    return;
  }
  const propertyNames = new Set(Object.keys(schema.properties));
  for (const required of schema.required ?? []) {
    if (!propertyNames.has(required)) throw new Error(`${path}.required references unknown property ${required}.`);
  }
  for (const [name, property] of Object.entries(schema.properties)) assertDataSchema(property, `${path}.properties.${name}`);
}

export function validateDataAgainstSchema(schema: DataSchema, value: unknown, path = '$'): DataValidationIssue[] {
  if ('const' in schema) {
    return primitiveEqual(value, schema.const)
      ? []
      : [{ path, code: 'const', message: `${path} must equal the declared constant.` }];
  }
  if ('oneOf' in schema) {
    const matches = schema.oneOf.filter((entry) => validateDataAgainstSchema(entry, value, path).length === 0).length;
    return matches === 1
      ? []
      : [{ path, code: 'oneOf', message: `${path} must match exactly one schema alternative.` }];
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return [{ path, code: 'type', message: `${path} must be a string.` }];
    if (schema.enum && !schema.enum.includes(value)) return [{ path, code: 'enum', message: `${path} is not an allowed value.` }];
    if (schema.minLength != null && value.length < schema.minLength) return [{ path, code: 'minLength', message: `${path} is too short.` }];
    if (schema.maxLength != null && value.length > schema.maxLength) return [{ path, code: 'maxLength', message: `${path} is too long.` }];
    return [];
  }
  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [{ path, code: 'type', message: `${path} must be a finite number.` }];
    if (schema.integer && !Number.isInteger(value)) return [{ path, code: 'integer', message: `${path} must be an integer.` }];
    if (schema.enum && !schema.enum.includes(value)) return [{ path, code: 'enum', message: `${path} is not an allowed value.` }];
    if (schema.minimum != null && value < schema.minimum) return [{ path, code: 'minimum', message: `${path} is below the minimum.` }];
    if (schema.maximum != null && value > schema.maximum) return [{ path, code: 'maximum', message: `${path} exceeds the maximum.` }];
    return [];
  }
  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? [] : [{ path, code: 'type', message: `${path} must be boolean.` }];
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [{ path, code: 'type', message: `${path} must be an array.` }];
    const issues: DataValidationIssue[] = [];
    if (schema.minItems != null && value.length < schema.minItems) issues.push({ path, code: 'minItems', message: `${path} has too few items.` });
    if (schema.maxItems != null && value.length > schema.maxItems) issues.push({ path, code: 'maxItems', message: `${path} has too many items.` });
    if (schema.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) {
      issues.push({ path, code: 'uniqueItems', message: `${path} must contain unique items.` });
    }
    value.forEach((entry, index) => issues.push(...validateDataAgainstSchema(schema.items, entry, `${path}[${index}]`)));
    return issues;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [{ path, code: 'type', message: `${path} must be an object.` }];
  }
  const record = value as Record<string, unknown>;
  const issues: DataValidationIssue[] = [];
  for (const required of schema.required ?? []) {
    if (!(required in record)) issues.push({ path: `${path}.${required}`, code: 'required', message: `${path}.${required} is required.` });
  }
  if (schema.additionalProperties === false) {
    for (const name of Object.keys(record)) {
      if (!(name in schema.properties)) issues.push({ path: `${path}.${name}`, code: 'additionalProperties', message: `${path}.${name} is not allowed.` });
    }
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    if (name in record) issues.push(...validateDataAgainstSchema(property, record[name], `${path}.${name}`));
  }
  return issues;
}
