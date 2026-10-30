/**
 * Brand configuration — the single source of truth for the whole app.
 *
 * Each entry drives server-side validation (validation.ts), the
 * GET /api/brands payload the frontend renders (selector, retrieval guide,
 * input hints, client-side checks), and how an identifier is normalized
 * into a lookup key.
 *
 * ERC-CAL is a lookup vault: it returns a code the owner stored earlier.
 * The identifier is only a database key; nothing here computes, derives or
 * reverse-engineers any manufacturer algorithm.
 */

export interface Brand {
  key: string;               // stable lowercase id, used in URLs and the DB
  name: string;
  icon: string;              // short initial for the selector chip
  identifier_label: string;  // input label, e.g. "Radio serial number"
  identifier_noun: string;   // short form for use mid-sentence, e.g. "radio serial"
  placeholder: string;
  // Regex the normalized identifier must fully match. Deliberately lenient:
  // it catches obvious mistakes, it doesn't encode format secrets.
  pattern: string;
  min_len: number;
  max_len: number;
  requirement: string;       // shown under the input and in errors
  retrieval_steps: string[]; // how to find the identifier on the vehicle
  note: string;
}

const ERC_PATTERN = "^[0-9A-F]{16}$";
const ERC_REQUIREMENT = "Exactly 16 hexadecimal characters (0-9, A-F).";

// Ordering here is the order the frontend renders the selector.
export const BRANDS: readonly Brand[] = [
  {
    key: "toyota",
    name: "Toyota",
    icon: "T",
    identifier_label: "ERC code (16-char seed)",
    identifier_noun: "ERC code",
    placeholder: "1A2B3C4D5E6F7A8B",
    pattern: ERC_PATTERN,
    min_len: 16,
    max_len: 16,
    requirement: ERC_REQUIREMENT,
    retrieval_steps: [
      "Turn the ignition to ACC/ON so the infotainment screen powers up.",
      "If the unit is locked after a battery disconnect, it shows an 'ERC' screen with a 16-character code.",
      "Write down the 16-character code exactly as shown — it is the key under which your unlock code is stored.",
      "Enter it here to retrieve the unlock code you saved for this unit.",
    ],
    note:
      "The on-screen ERC seed changes each time the battery is disconnected. " +
      "Store the unlock code you were issued against the seed you see, so you can find it again.",
  },
  {
    key: "lexus",
    name: "Lexus",
    icon: "L",
    identifier_label: "ERC code (16-char seed)",
    identifier_noun: "ERC code",
    placeholder: "9F8E7D6C5B4A3F2E",
    pattern: ERC_PATTERN,
    min_len: 16,
    max_len: 16,
    requirement: ERC_REQUIREMENT,
    retrieval_steps: [
      "Switch the ignition to ACC/ON and let the display boot.",
      "A locked unit shows the ERC screen with a 16-character code.",
      "Record the 16-character code exactly.",
      "Enter it here to retrieve your stored unlock code.",
    ],
    note:
      "Lexus units use the same ERC-style 16-character seed as Toyota. " +
      "The seed is regenerated on every battery disconnect.",
  },
  {
    key: "nissan",
    name: "Nissan",
    icon: "N",
    identifier_label: "Radio serial number",
    identifier_noun: "radio serial",
    placeholder: "BP1234567",
    pattern: "^[0-9A-Z]{5,12}$",
    min_len: 5,
    max_len: 12,
    requirement: "5-12 letters and digits (e.g. a 'BP...' serial).",
    retrieval_steps: [
      "Remove the head unit from the dash (or check the label on its case if already out).",
      "Find the serial on the manufacturer label — often prefixed 'BP', 'LCN' or similar.",
      "Alternatively, some units show the serial via a button combo — check your owner's manual for the sequence.",
      "Enter the serial here to retrieve the unlock PIN you stored.",
    ],
    note:
      "Many Nissan/Clarion units print the serial on a sticker on the chassis. " +
      "You usually need the unit partially removed to read it.",
  },
  {
    key: "honda",
    name: "Honda",
    icon: "H",
    identifier_label: "Radio serial number",
    identifier_noun: "radio serial",
    placeholder: "U1234567",
    pattern: "^[0-9A-Z]{6,12}$",
    min_len: 6,
    max_len: 12,
    requirement: "6-12 letters and digits.",
    retrieval_steps: [
      "Turn the ignition on. If the radio shows 'CODE' or 'ERR', it is locked.",
      "Retrieve the serial: hold Preset 1 and 6 while turning the radio on (older units), or read it from the label on the case.",
      "The screen/label shows an 8-digit serial (often starts 'U').",
      "Enter the serial here to retrieve your stored unlock code.",
    ],
    note:
      "Honda owners can also obtain their code from the official Honda radio-code service " +
      "using the serial and their VIN. Store that code here for next time.",
  },
  {
    key: "mitsubishi",
    name: "Mitsubishi",
    icon: "M",
    identifier_label: "Radio serial number",
    identifier_noun: "radio serial",
    placeholder: "MIT123456",
    pattern: "^[0-9A-Z]{5,14}$",
    min_len: 5,
    max_len: 14,
    requirement: "5-14 letters and digits.",
    retrieval_steps: [
      "Remove the head unit or locate the serial sticker on its case.",
      "Read the serial number from the manufacturer label.",
      "Enter the serial here to retrieve the unlock code you stored.",
    ],
    note:
      "Mitsubishi units vary by supplier (some are Clarion-based). " +
      "The serial on the case label is the reliable key.",
  },
  {
    key: "clarion",
    name: "Clarion",
    icon: "C",
    identifier_label: "Unit serial number",
    identifier_noun: "unit serial",
    placeholder: "PE1234567",
    pattern: "^[0-9A-Z]{5,14}$",
    min_len: 5,
    max_len: 14,
    requirement: "5-14 letters and digits.",
    retrieval_steps: [
      "Locate the serial label on the unit chassis.",
      "Read the serial (often prefixed with two letters).",
      "Enter it here to retrieve your stored unlock code.",
    ],
    note:
      "Clarion supplies head units to several brands, so the same serial format " +
      "appears across different vehicles.",
  },
];

const BY_KEY = new Map(BRANDS.map((b) => [b.key, b]));

export function getBrand(key: string): Brand | undefined {
  return BY_KEY.get(key.trim().toLowerCase());
}

/** Upper-case and drop spaces, dashes and dots — the usual noise in a
 * hand-typed serial. Case and separators never distinguish two real units,
 * so folding them makes lookups forgiving. */
export function normalize(raw: string): string {
  return stripSeparators(raw).toUpperCase();
}

export function stripSeparators(raw: string): string {
  return raw.replace(/[\s.-]/g, "");
}
