"use server";

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { geocoder, carrier } from "libphonenumber-geo-carrier";

export type PhoneArea =
  | { ok: false }
  | { ok: true; country: string; countryName: string; regionName: string; carrier: string; place: string };

/**
 * Resolve the GEOGRAPHIC AREA of a phone number's numbering plan: the country,
 * and for geographic (landline) numbers the area-code region, plus the carrier
 * for mobiles. This is where the number is REGISTERED, not the real-time
 * location of its holder — that cannot be derived from a number at all.
 *
 * Runs on the server because `libphonenumber-geo-carrier` reads its metadata
 * from disk via `fs`, which is unavailable in the browser bundle.
 */
export async function phoneAreaAction(input: string): Promise<PhoneArea> {
  try {
    const p = parsePhoneNumberFromString(input, "TH");
    if (!p || !p.country) return { ok: false };
    const region = (await geocoder(p, "en")) || "";
    const car = (await carrier(p, "en")) || "";
    const regionName = region.split("/")[0].trim(); // "Chiang Mai/Chiang Rai" -> "Chiang Mai"
    const countryName = new Intl.DisplayNames(["en"], { type: "region" }).of(p.country) ?? p.country;
    return {
      ok: true,
      country: p.country,
      countryName,
      regionName,
      carrier: car,
      place: regionName ? `${regionName}, ${countryName}` : countryName,
    };
  } catch {
    return { ok: false };
  }
}
