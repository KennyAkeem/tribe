import { NextResponse } from "next/server";
import appPackage from "../../../../../package.json";
import { createClient } from "@/lib/supabase/server";

const reverseLookupCache = new Map();
const cacheDurationMs = 24 * 60 * 60 * 1000;

function roundedCoordinate(value, minimum, maximum) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) return null;
  return (Math.round(coordinate * 10) / 10).toFixed(1);
}

function extractCityAddress(address = {}) {
  return {
    city: address.city || address.town || address.village || address.municipality || address.hamlet || "",
    region: address.state || address.province || address.region || "",
    country: address.country || "",
  };
}

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to update your location." }, { status: 401 });

  const parameters = new URL(request.url).searchParams;
  const latitude = roundedCoordinate(parameters.get("lat"), -90, 90);
  const longitude = roundedCoordinate(parameters.get("lon"), -180, 180);
  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "A valid location is required." }, { status: 400 });
  }

  const cacheKey = `${latitude},${longitude}`;
  const cached = reverseLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json({ address: cached.address });
  reverseLookupCache.delete(cacheKey);

  const { data: allowed, error: gateError } = await supabase.rpc("claim_location_lookup");
  if (gateError) {
    return NextResponse.json({ error: "Apply the 202610060004_profile_location.sql migration before updating your location." }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Location lookup is busy. Wait a moment and try again." }, {
      status: 429,
      headers: { "Retry-After": "1" },
    });
  }

  const lookupParameters = new URLSearchParams({
    format: "jsonv2",
    lat: latitude,
    lon: longitude,
    zoom: "10",
    addressdetails: "1",
  });
  const origin = request.headers.get("origin") || new URL(request.url).origin;
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${lookupParameters}`, {
    headers: {
      "Accept-Language": (request.headers.get("accept-language") || "en").slice(0, 100),
      "User-Agent": `Tribe Social App/${appPackage.version}`,
      Referer: origin,
    },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ error: "The location service is unavailable. Try again later." }, { status: 502 });
  }

  const result = await response.json().catch(() => null);
  if (!result?.address) return NextResponse.json({ error: "A city-level location could not be found here." }, { status: 404 });

  const address = extractCityAddress(result.address);
  reverseLookupCache.set(cacheKey, { address, expiresAt: Date.now() + cacheDurationMs });
  if (reverseLookupCache.size > 5000) {
    for (const [key, value] of reverseLookupCache) {
      if (value.expiresAt <= Date.now()) reverseLookupCache.delete(key);
    }
    if (reverseLookupCache.size > 5000) reverseLookupCache.delete(reverseLookupCache.keys().next().value);
  }

  return NextResponse.json({ address }, { headers: { "Cache-Control": "no-store" } });
}
