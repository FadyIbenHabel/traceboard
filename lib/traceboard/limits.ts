/** Shared bounds for incoming reports, restored briefs, and provider requests. */
export const INPUT_LIMITS = {
  bodyBytes: 128_000,
  sources: 6,
  sourceChars: 15_000,
  totalSourceChars: 60_000,
  titleChars: 160,
  descriptionChars: 8_000,
  sourceNameChars: 160,
  sourceIdChars: 80,
  modelChars: 100,
} as const;
