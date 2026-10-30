/**
 * Head-unit brands and their owner guides: how to read the unit's
 * identifiers and where an owner can legitimately get the unlock code.
 *
 * Tokyo Model Vault never generates or calculates unlock codes. These
 * guides point at the people who issue them (dealers, the manufacturer's
 * own code service) and the details they will ask for.
 */

const OWNERSHIP =
  "Bring proof that you own the car: the registration (or import/export certificate) and photo ID.";

const WRONG_ENTRIES =
  "Enter codes carefully. Many units add a waiting time, or lock for good, after several wrong attempts.";

export const UNITS = [
  {
    key: "toyota",
    name: "Toyota",
    needs: "erc",
    examples: "NSZT-W64, NSZT-W62G, NSCP-W64, NHZN-W61G",
    find_serial: [
      "The model and serial are printed on a label on the top or side of the unit's metal case.",
      "You usually have to slide the unit out of the dash to read it. Take a photo of the whole label.",
    ],
    find_erc: [
      "Turn the ignition to ACC or ON and wait for the locked screen asking for a password.",
      "Press and hold the unit's main button (labelled MENU, SETUP, CAR or a spanner icon, depending on the model). While holding it, switch the parking lights on and off 3 to 4 times.",
      "A service menu appears. Open the item labelled ERC; on some units it is on the second page.",
      "The ERC is shown: 16 characters using only 0-9 and A-F. Write it down exactly and take a photo.",
    ],
    erc_note:
      "The button sequence varies by model and software version. If it doesn't work, look up the owner's manual for your unit model (it's on the label, e.g. NSZT-W64).",
    get_code: [
      "Ask a Toyota dealer. Give them the VIN or chassis number, the unit model, its serial and the ERC.",
      OWNERSHIP,
      "Japanese-market units: dealers outside Japan can't always look these up. Ask before you pay, and check the papers that came with the car for a code card.",
    ],
    official: null,
    tips: [WRONG_ENTRIES],
  },
  {
    key: "lexus",
    name: "Lexus",
    needs: "erc",
    examples: "Factory Lexus navigation units",
    find_serial: [
      "The model and serial are on a label on the unit's case; the unit usually has to come out of the dash.",
    ],
    find_erc: [
      "Turn the ignition to ACC or ON.",
      "Press and hold MENU (or the unit's main button). While holding it, switch the parking lights on and off 3 to 4 times.",
      "In the service menu, open the item labelled ERC and copy the 16-character code (0-9 and A-F).",
    ],
    erc_note: "Lexus units use the same 16-character ERC as Toyota. The exact sequence varies by model year.",
    get_code: [
      "Ask a Lexus dealer with the VIN or chassis number, the unit model, its serial and the ERC.",
      OWNERSHIP,
      "Japanese-market units: dealers outside Japan can't always look these up, so ask first.",
    ],
    official: null,
    tips: [WRONG_ENTRIES],
  },
  {
    key: "honda",
    name: "Honda / Acura",
    needs: "unit_serial",
    examples: "Factory Honda and Acura audio and navigation",
    find_serial: [
      "On many units: with the radio off, hold preset buttons 1 and 6 and turn the radio on. The serial appears on screen.",
      "Otherwise check the label on the unit's case, or a sticker in the glovebox or owner's manual pack.",
    ],
    find_erc: [],
    erc_note: "",
    get_code: [
      "US-market cars: use Honda's official code service with the VIN and the unit serial. The serial must match Honda's record for that VIN.",
      "Otherwise, or if it doesn't match: ask a Honda or Acura dealer. Japanese-market (Gathers) units may need a dealer in Japan.",
      OWNERSHIP,
    ],
    official: { label: "Honda radio & navigation code service", url: "https://radio-navicode.honda.com/" },
    tips: [WRONG_ENTRIES],
  },
  {
    key: "nissan",
    name: "Nissan / Infiniti",
    needs: "unit_serial",
    examples: "Factory Nissan audio and navigation units",
    find_serial: [
      "Check the service book and owner's manual pack first. Some cars came with a code card.",
      "Otherwise the serial is on a label on the unit's case. Reading it usually means removing the unit from the dash.",
    ],
    find_erc: [],
    erc_note: "",
    get_code: [
      "Ask a Nissan dealer with the VIN, the unit serial and your proof of ownership. Some dealers charge a small fee.",
      OWNERSHIP,
    ],
    official: null,
    tips: [WRONG_ENTRIES],
  },
  {
    key: "mitsubishi",
    name: "Mitsubishi",
    needs: "unit_serial",
    examples: "Factory Mitsubishi audio units (some are made by Clarion)",
    find_serial: ["Read the serial from the label on the unit's case; the unit usually has to come out of the dash."],
    find_erc: [],
    erc_note: "",
    get_code: ["Ask a Mitsubishi dealer with the VIN and the unit serial.", OWNERSHIP],
    official: null,
    tips: [WRONG_ENTRIES],
  },
  {
    key: "clarion",
    name: "Clarion",
    needs: "unit_serial",
    examples: "Clarion units, fitted by several car makers",
    find_serial: ["The serial is on the unit's chassis label, usually starting with two letters."],
    find_erc: [],
    erc_note: "",
    get_code: [
      "If the unit came with the car, ask that car brand's dealer first.",
      "For aftermarket units, contact Clarion support with the serial and your proof of purchase.",
    ],
    official: null,
    tips: [WRONG_ENTRIES],
  },
  {
    key: "other",
    name: "Other / not sure",
    needs: "unit_serial",
    examples: "Mazda, Subaru, Suzuki, Daihatsu, aftermarket",
    find_serial: [
      "Read the model and serial from the label on the unit's case, and take a photo of the whole label.",
      "If the unit shows a long code on its locked screen or service menu (like Toyota's ERC), save that too.",
    ],
    find_erc: [],
    erc_note: "",
    get_code: [
      "Ask a dealer for the car's brand, or the maker named on the unit's label.",
      OWNERSHIP,
      "Paid code services exist. Use one only for a car you own, and check reviews first: many are unverified.",
    ],
    official: null,
    tips: [WRONG_ENTRIES],
  },
];

export const findUnit = (key) => UNITS.find((u) => u.key === key);

/** Whether the ERC field applies to this unit brand. */
export const usesErc = (unit) => unit.needs === "erc" || unit.key === "other";

/** Where a vehicle stands on the way to an unlocked unit. */
export function vehicleStatus(v) {
  if (v.unlock_code) return { key: "unlocked", label: "Code saved" };
  const unit = findUnit(v.unit_brand) || findUnit("other");
  if (unit.needs === "erc" ? v.erc : v.unit_serial || v.erc) return { key: "ready", label: "Ready to request" };
  return { key: "missing", label: unit.needs === "erc" ? "Needs ERC" : "Needs serial" };
}
