const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_REGEX = /\+?\d[\d\s().-]{8,}\d/gi;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;
const IP_REGEX = /\b(?:(?:2[0-5]{2}|1?\d?\d)\.){3}(?:2[0-5]{2}|1?\d?\d)\b/g;

export interface PIIMatch {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip';
  match: string;
  index: number;
}

const matchWithType = (pattern: RegExp, type: PIIMatch['type'], text: string): PIIMatch[] => {
  const matches: PIIMatch[] = [];
  let result: RegExpExecArray | null;
  const clone = new RegExp(pattern, pattern.flags);
  while ((result = clone.exec(text)) !== null) {
    matches.push({ type, match: result[0], index: result.index });
  }
  return matches;
};

export const detectPII = (text: string): PIIMatch[] => {
  if (!text) {
    return [];
  }
  return [
    ...matchWithType(EMAIL_REGEX, 'email', text),
    ...matchWithType(PHONE_REGEX, 'phone', text),
    ...matchWithType(SSN_REGEX, 'ssn', text),
    ...matchWithType(CREDIT_CARD_REGEX, 'credit_card', text),
    ...matchWithType(IP_REGEX, 'ip', text)
  ];
};

export const containsPII = (text: string): boolean => detectPII(text).length > 0;
