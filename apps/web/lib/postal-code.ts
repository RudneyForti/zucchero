export type PostalCodeAddress = {
  postalCode: string;
  street: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
};

export function postalCodeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatPostalCode(value: string) {
  const digits = postalCodeDigits(value);
  return digits.length > 5
    ? `${digits.slice(0, 5)}-${digits.slice(5)}`
    : digits;
}

export function addressLineFromPostalCode(address: PostalCodeAddress) {
  return [address.street, address.neighborhood].filter(Boolean).join(", ");
}

export function preserveTypedAddressDetail(current: string, resolved: string) {
  return current.trim() ? current : resolved;
}
