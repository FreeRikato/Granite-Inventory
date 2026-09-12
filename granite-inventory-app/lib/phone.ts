const PHONE_QUERY_PATTERN = /^\+?[\d\s().-]+$/;

export function phoneDigits(value: string): string {
  const trimmed = value.trim();
  return PHONE_QUERY_PATTERN.test(trimmed) ? trimmed.replace(/\D/g, "") : "";
}
