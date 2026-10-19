export function brazilianPhoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatBrazilianPhone(value: string) {
  const digits = brazilianPhoneDigits(value);
  if (!digits) return "";
  if (digits.length < 3) return `(${digits}`;

  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const prefixLength = subscriber.startsWith("9") ? 5 : 4;

  if (subscriber.length <= prefixLength) {
    return `(${areaCode}) ${subscriber}`;
  }

  return `(${areaCode}) ${subscriber.slice(0, prefixLength)}-${subscriber.slice(prefixLength)}`;
}
