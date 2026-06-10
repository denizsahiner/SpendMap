import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { gqlPaginate, withRetry } from "./gql";
import type { DistrictProfile, SpendFlow, TrendPoint } from "./types";
import postcodeNames from "../../public/postcode-names.json";

const nameMap = postcodeNames as Record<string, string>;

/**
 * NOTE: The following GraphQL queries were originally designed for AWS AppSync 
 * with a DynamoDB backend. If you are moving to a local database (e.g., PostgreSQL, 
 * SQLite, MongoDB), you will need to either:
 * 1. Implement a GraphQL server that matches this schema.
 * 2. Refactor these tools to use a different data fetching method (REST, Prisma, etc.).
 */

// ─── Spatial helper ────────────────────────────────────────────────────────────

function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if ((yi > point.lat) !== (yj > point.lat) &&
        point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── GraphQL query strings ─────────────────────────────────────────────────────

const Q_FLOWS_BY_CARDHOLDER = `
  query($loc: String!, $yp: String!, $nextToken: String) {
    listSpendRecordByCardholderLocationAndYearPeriod(
      cardholderLocation: $loc
      yearPeriod: { eq: $yp }
      limit: 500
      nextToken: $nextToken
    ) {
      items { merchantLocation cardholderIndexSpend merchantIndexSpend }
      nextToken
    }
  }`;

const Q_FLOWS_BY_MERCHANT = `
  query($loc: String!, $yp: String!, $nextToken: String) {
    listSpendRecordByMerchantLocationAndYearPeriod(
      merchantLocation: $loc
      yearPeriod: { eq: $yp }
      limit: 500
      nextToken: $nextToken
    ) {
      items { cardholderLocation cardholderIndexSpend merchantIndexSpend }
      nextToken
    }
  }`;

const Q_POPULATION = `
  query($pc: String!, $nextToken: String) {
    listPopulationData(filter: { postcode: { eq: $pc } }, limit: 500, nextToken: $nextToken) {
      items {
        postcode total_population
        age_0_15_f age_16_24_f age_25_34_f age_35_49_f age_50_64_f over_65_f
        age_0_15_m age_16_24_m age_25_34_m age_35_49_m age_50_64_m over_65_m
      }
      nextToken
    }
  }`;

const Q_HOUSEHOLD = `
  query($pc: String!, $nextToken: String) {
    listHouseholdData(filter: { postcode: { eq: $pc } }, limit: 500, nextToken: $nextToken) {
      items {
        postcode families_with_children over_66 students working_professionals total_households
      }
      nextToken
    }
  }`;

const Q_POSTCODE_DATA = `
  query($pc: String!, $nextToken: String) {
    listPostcodeData(filter: { postcode: { eq: $pc } }, limit: 500, nextToken: $nextToken) {
      items { postcode householdCount gdhi tam }
      nextToken
    }
  }`;

// ─── Tool factory ─────────────────────────────────────────────────────────────

export function createTools(token: string) {

  // 1. resolveDistricts ────────────────────────────────────────────────────────
  const resolveDistricts = tool(
    async ({ query }) => {
      const q = query.trim();

      // Already looks like a postcode district code (e.g. "CV2", "M1")
      if (/^[A-Z]{1,2}\d{0,2}$/i.test(q)) {
        const code = q.toUpperCase();
        return { districts: [code], regionName: nameMap[code] ?? code, matched: 1 };
      }

      // Try local name map first
      const lower = q.toLowerCase();
      const nameMatches = Object.entries(nameMap)
        .filter(([, name]) => name.toLowerCase().includes(lower))
        .map(([code]) => code);

      // Only short-circuit on strong name matches (≥3 results).
      if (nameMatches.length >= 3) {
        return {
          districts: nameMatches.slice(0, 40),
          regionName: q,
          matched: nameMatches.length,
          note: nameMatches.length > 40 ? `Only returning first 40 of ${nameMatches.length} matches` : undefined,
        };
      }

      // No local match — geocode via Nominatim then sample postcode districts via postcodes.io
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q + " UK")}&format=json&limit=1&addressdetails=1`;
        const nomRes = await withRetry(() => fetch(nomUrl, {
          headers: { "User-Agent": "SpendMap/1.0", "Accept-Language": "en" },
          signal: AbortSignal.timeout(10_000),
        }));
        if (!nomRes.ok) return { districts: [], regionName: q, matched: 0 };

        const places = await nomRes.json() as Array<{
          lat: string; lon: string; display_name: string;
          boundingbox?: string[];
          address?: { country_code?: string };
        }>;

        if (!places?.length) return { districts: [], regionName: q, matched: 0 };

        const place = places[0];
        if (place.address?.country_code && place.address.country_code.toLowerCase() !== "gb") {
          return { districts: [], regionName: q, matched: 0, note: "Location not in UK" };
        }

        const bb = place.boundingbox; // [minLat, maxLat, minLon, maxLon]
        const centerLat = parseFloat(place.lat);
        const centerLon = parseFloat(place.lon);

        // Build a 3×3 grid of sample points across the bounding box + center
        const samplePoints: { longitude: number; latitude: number; limit: number }[] = [];
        if (bb && bb.length === 4) {
          const minLat = parseFloat(bb[0]), maxLat = parseFloat(bb[1]);
          const minLon = parseFloat(bb[2]), maxLon = parseFloat(bb[3]);
          for (const lf of [0.2, 0.5, 0.8]) {
            for (const of_ of [0.2, 0.5, 0.8]) {
              samplePoints.push({
                latitude:  minLat + (maxLat - minLat) * lf,
                longitude: minLon + (maxLon - minLon) * of_,
                limit: 5,
              });
            }
          }
        }
        samplePoints.push({ latitude: centerLat, longitude: centerLon, limit: 10 });

        const bulkRes = await withRetry(() => fetch("https://api.postcodes.io/postcodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geolocations: samplePoints }),
          signal: AbortSignal.timeout(10_000),
        }));

        if (!bulkRes.ok) return { districts: [], regionName: place.display_name, matched: 0 };

        const bulkData = await bulkRes.json() as {
          result: Array<{ result: Array<{ outcode: string }> | null }> | null;
        };

        const districtSet = new Set<string>();
        if (bulkData?.result) {
          for (const entry of bulkData.result) {
            if (entry?.result) {
              for (const pc of entry.result) {
                const code = pc.outcode?.toUpperCase();
                if (code && nameMap[code]) districtSet.add(code);
              }
            }
          }
        }

        // Also include any local name matches geocoding may have missed
        for (const code of nameMatches) {
          if (nameMap[code]) districtSet.add(code);
        }

        const districts = Array.from(districtSet);
        return {
          districts,
          regionName: place.display_name,
          matched: districts.length,
        };
      } catch {
        return { districts: [], regionName: q, matched: 0, note: "Geocoding failed" };
      }
    },
    {
      name: "resolveDistricts",
      description:
        "Convert a place name, city, or UK region to postcode district codes. " +
        "Examples: 'Coventry' → ['CV1','CV2',...], 'North London' → ['N1','N4','N7',...]",
      schema: z.object({
        query: z.string().describe(
          "City, town, or region name or a postcode district code like 'CV2'"
        ),
      }),
    },
  );

  // 2. resolveVenue ────────────────────────────────────────────────────────────
  const resolveVenue = tool(
    async ({ query }) => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`;

      let res: Response;
      try {
        res = await withRetry(() => fetch(url, {
          headers: {
            "User-Agent": "SpendMap/1.0",
            "Accept-Language": "en",
          },
          signal: AbortSignal.timeout(10_000),
        }));
      } catch {
        return { found: false, error: "Nominatim request failed" };
      }

      if (!res.ok) return { found: false, error: `Nominatim responded ${res.status}` };

      const results = await res.json() as Array<{
        display_name: string;
        lat: string;
        lon: string;
        address: Record<string, string>;
      }>;

      if (!results?.length) return { found: false, query };

      const place = results[0];
      const countryCode = place.address?.country_code?.toLowerCase();
      const country = place.address?.country ?? "Unknown";

      if (countryCode !== "gb") {
        return { found: true, inUK: false, country, displayName: place.display_name };
      }

      const rawPostcode = place.address?.postcode;
      const district = rawPostcode
        ? rawPostcode.trim().split(/\s+/)[0].toUpperCase()
        : undefined;

      return {
        found: true,
        inUK: true,
        displayName: place.display_name,
        postcode: rawPostcode,
        district,
        districtName: district ? nameMap[district] : undefined,
      };
    },
    {
      name: "resolveVenue",
      description:
        "Look up a specific venue, shopping centre, or named place to find its UK postcode district. " +
        "If the place is outside the UK, returns inUK: false.",
      schema: z.object({
        query: z.string().describe("Venue or place name, e.g. 'Westfield Stratford London'"),
      }),
    },
  );

  // 3. getSpendingFlows ────────────────────────────────────────────────────────
  const getSpendingFlows = tool(
    async ({ district, yearPeriod, mode, topN }) => {
      const isOrigin = mode === "origin";
      const queryKey = isOrigin
        ? "listSpendRecordByCardholderLocationAndYearPeriod"
        : "listSpendRecordByMerchantLocationAndYearPeriod";

      type RawFlow = {
        merchantLocation?: string;
        cardholderLocation?: string;
        cardholderIndexSpend: number;
        merchantIndexSpend: number;
      };

      let raw: RawFlow[];
      try {
        raw = await gqlPaginate<RawFlow>(
          isOrigin ? Q_FLOWS_BY_CARDHOLDER : Q_FLOWS_BY_MERCHANT,
          { loc: district, yp: yearPeriod },
          token,
          queryKey,
          3,
        );
      } catch (err) {
        return { district, yearPeriod, mode, flows: [], totalLocations: 0, error: err instanceof Error ? err.message : String(err) };
      }

      const flows: SpendFlow[] = raw
        .filter((r) => {
          const loc = isOrigin ? r.merchantLocation : r.cardholderLocation;
          return loc && loc.toUpperCase() !== "UNKNOWN";
        })
        .map((r) => {
          const loc = (isOrigin ? r.merchantLocation : r.cardholderLocation)!;
          return {
            location: loc,
            spend: isOrigin ? r.merchantIndexSpend : r.cardholderIndexSpend,
            cardholderIndexSpend: r.cardholderIndexSpend,
            merchantIndexSpend: r.merchantIndexSpend,
            name: nameMap[loc],
          };
        })
        .sort((a, b) => b.spend - a.spend)
        .slice(0, topN ?? 20);

      return {
        district,
        yearPeriod,
        mode,
        flows,
        totalLocations: raw.length,
      };
    },
    {
      name: "getSpendingFlows",
      description:
        "Get spending flow data for a postcode district. " +
        "In 'origin' mode: where residents spend. " +
        "In 'destination' mode: where customers come from.",
      schema: z.object({
        district: z.string().describe("Postcode district code, e.g. 'CV2'"),
        yearPeriod: z.string().describe("Period in format 'YYYY#QN', e.g. '2023#Q1'"),
        mode: z.enum(["origin", "destination"]),
        topN: z.number().optional().describe("Number of top flows to return (default 20, max 50)"),
      }),
    },
  );

  // 3. getDistrictProfile ──────────────────────────────────────────────────────
  const getDistrictProfile = tool(
    async ({ districts }) => {
      let profiles: DistrictProfile[];
      try {
        profiles = await Promise.all(
          districts.map(async (district) => {
          type PopRow = { total_population: number | null; age_0_15_f: number | null; age_16_24_f: number | null; age_25_34_f: number | null; age_35_49_f: number | null; age_50_64_f: number | null; over_65_f: number | null; age_0_15_m: number | null; age_16_24_m: number | null; age_25_34_m: number | null; age_35_49_m: number | null; age_50_64_m: number | null; over_65_m: number | null };
          type HhRow  = { families_with_children: number; over_66: number; students: number; working_professionals: number; total_households: number };
          type PcRow  = { tam: number; gdhi: number };

          const [popItems, hhItems, pcItems] = await Promise.all([
            gqlPaginate<PopRow>(Q_POPULATION, { pc: district }, token, "listPopulationData", 10),
            gqlPaginate<HhRow>(Q_HOUSEHOLD,   { pc: district }, token, "listHouseholdData",  10),
            gqlPaginate<PcRow>(Q_POSTCODE_DATA, { pc: district }, token, "listPostcodeData", 10),
          ]);

          const pop = popItems[0];
          const hh  = hhItems[0];
          const pc  = pcItems[0];

          const n = (v: number | null | undefined) => v ?? 0;
          return {
            district,
            name: nameMap[district],
            population:  n(pop?.total_population),
            female:      pop ? n(pop.age_0_15_f) + n(pop.age_16_24_f) + n(pop.age_25_34_f) + n(pop.age_35_49_f) + n(pop.age_50_64_f) + n(pop.over_65_f) : 0,
            male:        pop ? n(pop.age_0_15_m) + n(pop.age_16_24_m) + n(pop.age_25_34_m) + n(pop.age_35_49_m) + n(pop.age_50_64_m) + n(pop.over_65_m) : 0,
            age_0_15:    pop ? n(pop.age_0_15_f) + n(pop.age_0_15_m) : 0,
            age_16_24:   pop ? n(pop.age_16_24_f) + n(pop.age_16_24_m) : 0,
            age_25_34:   pop ? n(pop.age_25_34_f) + n(pop.age_25_34_m) : 0,
            age_35_49:   pop ? n(pop.age_35_49_f) + n(pop.age_35_49_m) : 0,
            age_50_64:   pop ? n(pop.age_50_64_f) + n(pop.age_50_64_m) : 0,
            over_65:     pop ? n(pop.over_65_f) + n(pop.over_65_m) : 0,
            households:  hh?.total_households ?? 0,
            families:    hh?.families_with_children ?? 0,
            over66:      hh?.over_66 ?? 0,
            students:    hh?.students ?? 0,
            working:     hh?.working_professionals ?? 0,
            tam:         pc?.tam ?? 0,
            gdhi:        pc?.gdhi ?? 0,
          } satisfies DistrictProfile;
          }),
        );
      } catch (err) {
        return { profiles: [], error: err instanceof Error ? err.message : String(err) };
      }

      return { profiles };
    },
    {
      name: "getDistrictProfile",
      description:
        "Get demographic and market profile for one or more postcode districts.",
      schema: z.object({
        districts: z.array(z.string()).max(10).describe("List of postcode district codes"),
      }),
    },
  );

  // 4. getSpendingTrend ────────────────────────────────────────────────────────
  const getSpendingTrend = tool(
    async ({ district, mode, periods, locations }) => {
      const isOrigin = mode === "origin";
      const queryKey = isOrigin
        ? "listSpendRecordByCardholderLocationAndYearPeriod"
        : "listSpendRecordByMerchantLocationAndYearPeriod";
      const spendField = isOrigin ? "merchantIndexSpend" : "cardholderIndexSpend";

      type RawFlow = { cardholderIndexSpend: number; merchantIndexSpend: number; merchantLocation?: string; cardholderLocation?: string };

      const filterSet = locations?.length ? new Set(locations.map(l => l.toUpperCase())) : null;

      let periodRows: { period: string; rows: RawFlow[] }[];
      try {
        periodRows = await Promise.all(
          periods.map(async (period) => {
            const raw = await gqlPaginate<RawFlow>(
              isOrigin ? Q_FLOWS_BY_CARDHOLDER : Q_FLOWS_BY_MERCHANT,
              { loc: district, yp: period },
              token,
              queryKey,
              3,
            );
            return { period, rows: raw };
          }),
        );
      } catch (err) {
        return { district, mode, type: "aggregate" as const, trend: [], changeRate: 0, direction: "stable" as const, error: err instanceof Error ? err.message : String(err) };
      }

      if (filterSet) {
        const seriesMap = new Map<string, { period: string; spend: number }[]>();
        for (const { period, rows } of periodRows) {
          for (const r of rows) {
            const loc = (isOrigin ? r.merchantLocation : r.cardholderLocation)?.toUpperCase();
            if (!loc || !filterSet.has(loc)) continue;
            if (!seriesMap.has(loc)) seriesMap.set(loc, []);
            seriesMap.get(loc)!.push({ period, spend: Math.round(r[spendField] * 1000) / 1000 });
          }
        }

        const series = Array.from(filterSet).map(loc => ({
          location: loc,
          name: nameMap[loc],
          trend: seriesMap.get(loc) ?? periods.map(p => ({ period: p, spend: 0 })),
        }));

        return { district, mode, type: "series", series };
      }

      const trend: TrendPoint[] = periodRows.map(({ period, rows }) => {
        const validRows = rows.filter((r) => {
          const loc = isOrigin ? r.merchantLocation : r.cardholderLocation;
          return loc && loc.toUpperCase() !== "UNKNOWN";
        });
        const totalSpend = validRows.reduce((s, r) => s + r[spendField], 0);
        const topRow = [...validRows].sort((a, b) => b[spendField] - a[spendField])[0];
        const topLoc = isOrigin ? topRow?.merchantLocation : topRow?.cardholderLocation;
        return { period, totalSpend: Math.round(totalSpend * 100) / 100, topLocation: topLoc ?? "—" };
      });

      const first = trend[0]?.totalSpend ?? 0;
      const last  = trend.at(-1)?.totalSpend ?? 0;
      const changeRate = first > 0 ? ((last - first) / first) * 100 : 0;

      return {
        district,
        mode,
        type: "aggregate",
        trend,
        changeRate: Math.round(changeRate * 10) / 10,
        direction: changeRate > 2 ? "growing" : changeRate < -2 ? "declining" : "stable",
      };
    },
    {
      name: "getSpendingTrend",
      description:
        "Get spending trend across multiple time periods.",
      schema: z.object({
        district:   z.string().describe("Base postcode district"),
        mode:       z.enum(["origin", "destination"]),
        periods:    z.array(z.string()).min(2).max(8).describe(
          "List of periods in 'YYYY#QN' format"
        ),
        locations:  z.array(z.string()).optional().describe(
          "Specific districts to track separately."
        ),
      }),
    },
  );

  // 5. compareDistricts ────────────────────────────────────────────────────────
  const compareDistricts = tool(
    async ({ districts, metric, yearPeriod }) => {
      if (metric === "demographics" || metric === "market") {
        const { profiles } = await getDistrictProfile.invoke({ districts });
        return { metric, districts, profiles };
      }

      const results = await Promise.all(
        districts.map(async (d) => {
          const { flows } = await getSpendingFlows.invoke({
            district: d,
            yearPeriod: yearPeriod ?? "2023#Q1",
            mode: "origin",
            topN: 10,
          });
          const totalSpend = flows.reduce((s: number, f: SpendFlow) => s + f.spend, 0);
          return { district: d, name: nameMap[d], totalSpend, topFlow: flows[0] };
        }),
      );

      return { metric, districts, results };
    },
    {
      name: "compareDistricts",
      description:
        "Compare 2–5 postcode districts side by side.",
      schema: z.object({
        districts:  z.array(z.string()).min(2).max(5).describe("2–5 postcode district codes"),
        metric:     z.enum(["spending", "demographics", "market"]),
        yearPeriod: z.string().optional().describe("Required for spending metric"),
      }),
    },
  );

  // 6. getTopDistricts ─────────────────────────────────────────────────────────
  const getTopDistricts = tool(
    async ({ district, yearPeriod, mode, direction, n }) => {
      const { flows } = await getSpendingFlows.invoke({
        district,
        yearPeriod,
        mode,
        topN: direction === "bottom" ? 1000 : 50,
      });

      const ranked = direction === "top" ? flows : [...flows].reverse();
      return {
        district,
        yearPeriod,
        mode,
        direction,
        ranked: ranked.slice(0, n ?? 10),
      };
    },
    {
      name: "getTopDistricts",
      description:
        "Get the top or bottom N districts by spending flow.",
      schema: z.object({
        district:   z.string().describe("Base postcode district"),
        yearPeriod: z.string().describe("Period in 'YYYY#QN' format"),
        mode:       z.enum(["origin", "destination"]),
        direction:  z.enum(["top", "bottom"]),
        n:          z.number().min(1).max(20).optional().describe("Number of results"),
      }),
    },
  );

  // 7. listVenuesInDistrict ────────────────────────────────────────────────────

  const OSM_FILTERS: Record<string, string[]> = {
    shopping_centre:  ['["shop"="mall"]', '["shop"="department_store"]'],
    retail:           ['["shop"]'],
    clothes:          ['["shop"="clothes"]'],
    shoes:            ['["shop"="shoes"]'],
    jewellery:        ['["shop"="jewelry"]', '["shop"="jewellery"]'],
    accessories:      ['["shop"="accessories"]', '["shop"="bag"]', '["shop"="leather"]'],
    supermarket:      ['["shop"="supermarket"]'],
    convenience:      ['["shop"="convenience"]'],
    bakery:           ['["shop"="bakery"]'],
    butcher:          ['["shop"="butcher"]'],
    deli:             ['["shop"="deli"]'],
    greengrocer:      ['["shop"="greengrocer"]'],
    electronics:      ['["shop"="electronics"]'],
    mobile_phone:     ['["shop"="mobile_phone"]'],
    computer:         ['["shop"="computer"]'],
    pharmacy:         ['["shop"="pharmacy"]'],
    beauty:           ['["shop"="beauty"]', '["shop"="cosmetics"]'],
    hairdresser:      ['["shop"="hairdresser"]'],
    optician:         ['["shop"="optician"]'],
    sports:           ['["shop"="sports"]'],
    books:            ['["shop"="books"]'],
    music:            ['["shop"="music"]'],
    toys:             ['["shop"="toys"]'],
    games:            ['["shop"="games"]'],
    furniture:        ['["shop"="furniture"]'],
    hardware:         ['["shop"="hardware"]'],
    florist:          ['["shop"="florist"]'],
    garden_centre:    ['["shop"="garden_centre"]'],
    restaurant:       ['["amenity"="restaurant"]'],
    cafe:             ['["amenity"="cafe"]'],
    fast_food:        ['["amenity"="fast_food"]'],
    bar:              ['["amenity"="bar"]'],
    pub:              ['["amenity"="pub"]'],
    bank:             ['["amenity"="bank"]'],
    post_office:      ['["amenity"="post_office"]'],
    gym:              ['["leisure"="fitness_centre"]'],
    cinema:           ['["amenity"="cinema"]'],
    hotel:            ['["tourism"="hotel"]'],
    dentist:          ['["amenity"="dentist"]'],
    doctors:          ['["amenity"="doctors"]'],
    hospital:         ['["amenity"="hospital"]'],
  };

  const listVenuesInDistrict = tool(
    async ({ district, category, limit }) => {
      const code = district.toUpperCase().trim();

      const outcodeRes = await withRetry(() => fetch(`https://api.postcodes.io/outcodes/${code}`, { signal: AbortSignal.timeout(10_000) }));
      if (!outcodeRes.ok) return { district: code, venues: [], error: `District ${code} not found` };

      const { result } = await outcodeRes.json() as { result: { latitude: number; longitude: number } };
      const { latitude, longitude } = result;

      const key = category.toLowerCase();
      const filters: string[] = OSM_FILTERS[key] ?? [`["shop"="${key}"]`, `["amenity"="${key}"]`];
      const radius = 2000;

      const unionLines = filters.flatMap((f) => [
        `  node${f}(around:${radius},${latitude},${longitude});`,
        `  way${f}(around:${radius},${latitude},${longitude});`,
        `  relation${f}(around:${radius},${latitude},${longitude});`,
      ]);

      const query = ["[out:json][timeout:25];", "(", ...unionLines, ");", "out center tags;"].join("\n");

      let overpassRes: Response;
      try {
        overpassRes = await withRetry(() => fetch("https://overpass-api.de/api/interpreter", {
          method:  "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent":   "SpendMap/1.0",
          },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(30_000),
        }));
      } catch (err) {
        return { district: code, venues: [], error: `Overpass fetch failed: ${String(err)}` };
      }

      if (!overpassRes.ok) {
        const body = await overpassRes.text().catch(() => "");
        return { district: code, venues: [], error: `Overpass ${overpassRes.status}` };
      }

      type OsmElement = { tags?: Record<string, string> };

      const data = await overpassRes.json() as { elements: OsmElement[] };

      const venues = (data.elements ?? [])
        .filter((el) => el.tags?.name)
        .map((el) => ({
          name:     el.tags!.name!,
          type:     el.tags!.shop ?? el.tags!.amenity ?? el.tags!.leisure ?? el.tags!.tourism ?? "unknown",
          address:  [el.tags!["addr:street"], el.tags!["addr:housenumber"]].filter(Boolean).join(" ") || undefined,
          postcode: el.tags!["addr:postcode"] || undefined,
          brand:    el.tags!.brand || undefined,
          website:  el.tags!.website || el.tags!["contact:website"] || undefined,
        }))
        .slice(0, limit ?? 10);

      return {
        district: code,
        districtName: nameMap[code] ?? code,
        category,
        radiusMeters: radius,
        venues,
        totalFound: venues.length,
      };
    },
    {
      name: "listVenuesInDistrict",
      description:
        "List venues of a specific type in a UK postcode district.",
      schema: z.object({
        district: z.string().describe("Postcode district code"),
        category: z.string().describe("Venue category key"),
        limit: z.number().min(1).max(50).optional().describe("Max results"),
      }),
    },
  );

  // 8. getDistrictsInRadius ────────────────────────────────────────────────────
  const getDistrictsInRadius = tool(
    async ({ district, radiusKm }) => {
      const code = district.toUpperCase().trim();

      const centerRes = await withRetry(() => fetch(`https://api.postcodes.io/outcodes/${code}`, { signal: AbortSignal.timeout(10_000) }));
      if (!centerRes.ok) return { error: `District ${code} not found`, districts: [], center: code, radiusKm };

      const { result: center } = await centerRes.json() as {
        result: { latitude: number; longitude: number };
      };

      const radiusMeters = Math.min(Math.round(radiusKm * 1000), 25000);

      const nearbyRes = await withRetry(() => fetch(
        `https://api.postcodes.io/outcodes?longitude=${center.longitude}&latitude=${center.latitude}&radius=${radiusMeters}&limit=100`,
        { signal: AbortSignal.timeout(10_000) },
      ));
      if (!nearbyRes.ok) return { error: "Failed to fetch nearby districts", districts: [], center: code, radiusKm };

      const { result: nearby } = await nearbyRes.json() as {
        result: Array<{ outcode: string; distance: number }> | null;
      };

      const districts = (nearby ?? [])
        .filter((o) => nameMap[o.outcode.toUpperCase()])
        .map((o) => ({
          code:     o.outcode.toUpperCase(),
          name:     nameMap[o.outcode.toUpperCase()],
          distanceKm: Math.round(o.distance / 100) / 10,
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm);

      return {
        center: code,
        centerName: nameMap[code] ?? code,
        radiusKm,
        radiusMeters,
        districts,
        count: districts.length,
      };
    },
    {
      name: "getDistrictsInRadius",
      description:
        "Find districts within a kilometre-based radius.",
      schema: z.object({
        district:  z.string().describe("Centre postcode district"),
        radiusKm:  z.number().min(0.1).max(25).describe("Search radius in km"),
      }),
    },
  );

  // 9. getTravelTimeDistricts ──────────────────────────────────────────────────
  const getTravelTimeDistricts = tool(
    async ({ district, minutes, mode, searchType }) => {
      const code = district.toUpperCase().trim();

      const originRes = await withRetry(() => fetch(`https://api.postcodes.io/outcodes/${code}`, { signal: AbortSignal.timeout(10_000) }));
      if (!originRes.ok) return { error: `District ${code} not found`, districts: [], count: 0 };
      const { result: origin } = await originRes.json() as {
        result: { latitude: number; longitude: number };
      };

      const ref = new Date();
      const day = ref.getDay();
      if (day === 0) ref.setDate(ref.getDate() + 1);
      else if (day === 6) ref.setDate(ref.getDate() + 2);
      ref.setUTCHours(9, 0, 0, 0);
      const refTime = ref.toISOString().replace(/\.\d{3}Z$/, "Z");

      const isDeparture = searchType !== "arrival";
      const searchKey   = isDeparture ? "departure_searches" : "arrival_searches";
      const timeKey     = isDeparture ? "departure_time"     : "arrival_time";

      const requestBody = {
        [searchKey]: [{
          id: "search",
          coords: { lat: origin.latitude, lng: origin.longitude },
          transportation: { type: mode },
          [timeKey]: refTime,
          travel_time: minutes * 60,
        }],
      };
      
      const ttRes = await withRetry(() => fetch("https://api.traveltimeapp.com/v4/time-map", {
        method:  "POST",
        headers: {
          "Content-Type":     "application/json",
          "X-Application-Id": process.env.TRAVELTIME_APP_ID || "",
          "X-Api-Key":        process.env.TRAVELTIME_APP_KEY || "",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      }), 2);

      if (!ttRes.ok) {
        return { error: `TravelTime API error ${ttRes.status}`, districts: [], count: 0 };
      }

      const ttData = await ttRes.json() as {
        results?: Array<{
          shapes?: Array<{ shell: { lat: number; lng: number }[] }>;
        }>;
      };

      const shells = (ttData.results?.[0]?.shapes ?? [])
        .map(s => s.shell)
        .filter(s => s.length >= 3);

      if (!shells.length) return { error: "No isochrone returned", districts: [], count: 0 };

      const allPts = shells.flat();
      const lats = allPts.map(p => p.lat);
      const lngs = allPts.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const midLat = (minLat + maxLat) / 2;

      const LAT_STEP = 40 / 111;
      const LNG_STEP = 40 / (111 * Math.cos(midLat * Math.PI / 180));

      const queryPoints: { lat: number; lng: number }[] = [];
      for (let lat = minLat; lat <= maxLat + LAT_STEP * 0.1; lat += LAT_STEP) {
        for (let lng = minLng; lng <= maxLng + LNG_STEP * 0.1; lng += LNG_STEP) {
          queryPoints.push({ lat, lng });
        }
      }

      const seen = new Set<string>();
      const candidates: Array<{ outcode: string; latitude: number; longitude: number }> = [];

      await Promise.all(queryPoints.slice(0, 16).map(async (pt) => {
        const res = await withRetry(() => fetch(
          `https://api.postcodes.io/outcodes?longitude=${pt.lng}&latitude=${pt.lat}&radius=25000&limit=100`,
          { signal: AbortSignal.timeout(10_000) },
        ));
        if (!res.ok) return;
        const { result } = await res.json() as {
          result: Array<{ outcode: string; latitude: number; longitude: number }> | null;
        };
        for (const o of result ?? []) {
          const oc = o.outcode.toUpperCase();
          if (!seen.has(oc) && nameMap[oc]) {
            seen.add(oc);
            candidates.push({ outcode: oc, latitude: o.latitude, longitude: o.longitude });
          }
        }
      }));

      const districts = candidates
        .filter(o => shells.some(shell =>
          pointInPolygon({ lat: o.latitude, lng: o.longitude }, shell),
        ))
        .map(o => ({ code: o.outcode, name: nameMap[o.outcode] }));

      return {
        center: code,
        centerName: nameMap[code] ?? code,
        minutes,
        mode,
        searchType: isDeparture ? "departure" : "arrival",
        districts,
        count: districts.length,
      };
    },
    {
      name: "getTravelTimeDistricts",
      description:
        "Find districts within a travel time budget.",
      schema: z.object({
        district:   z.string().describe("Centre postcode district"),
        minutes:    z.number().min(5).max(120).describe("Travel time in minutes"),
        mode:       z.enum(["public_transport", "walking", "cycling", "driving"]),
        searchType: z.enum(["departure", "arrival"]),
      }),
    },
  );

  // 10. getAreaZones ─────────────────────────────────────────────────────────
  const getAreaZones = tool(
    async ({ district, yearPeriod, mode }) => {
      const { flows } = await getSpendingFlows.invoke({
        district,
        yearPeriod,
        mode,
        topN: 300,
      });

      if (!flows.length) {
        return { district, error: "No spending data found", focus: [], wider: [], catchment: [] };
      }

      const focus:    string[] = [];
      const wider:    string[] = [];
      const catchment: string[] = [];

      for (const f of flows) {
        if (f.spend <= 0) continue;
        catchment.push(f.location);
        if (f.spend >= 1.0) {
          focus.push(f.location);
        } else {
          wider.push(f.location);
        }
      }

      return {
        district,
        yearPeriod,
        mode,
        focus: { districts: focus },
        wider: { districts: wider },
        catchment: { districts: catchment },
        totalFlowDistricts: flows.length,
      };
    },
    {
      name: "getAreaZones",
      description:
        "Classify districts into focus area, wider area, and catchment area.",
      schema: z.object({
        district:   z.string().describe("Postcode district"),
        yearPeriod: z.string().describe("Period in 'YYYY#QN' format"),
        mode:       z.enum(["origin", "destination"]),
      }),
    },
  );

  // 11. getMarketPotential ────────────────────────────────────────────────────
  const getMarketPotential = tool(
    async ({ district, yearPeriod, mode, topN }) => {
      const { flows, totalLocations } = await getSpendingFlows.invoke({
        district,
        yearPeriod,
        mode,
        topN: topN ?? 50,
      });

      if (!flows.length) {
        return { district, yearPeriod, mode, flows: [], totalMarketPotential: 0, totalLocations: 0 };
      }

      let baseTam: number;
      const tamMap: Record<string, number> = {};
      const CONCURRENCY = 5;

      if (mode === "origin") {
        const { profiles } = await getDistrictProfile.invoke({ districts: [district] });
        baseTam = profiles[0]?.tam ?? 0;
      } else {
        const counterparts = flows.map((f) => f.location);
        const batches: string[][] = [];
        for (let i = 0; i < counterparts.length; i += 10) {
          batches.push(counterparts.slice(i, i + 10));
        }
        for (let i = 0; i < batches.length; i += CONCURRENCY) {
          await Promise.all(
            batches.slice(i, i + CONCURRENCY).map(async (batch) => {
              const { profiles } = await getDistrictProfile.invoke({ districts: batch });
              for (const p of profiles) tamMap[p.district] = p.tam;
            }),
          );
        }
        baseTam = 0;
      }

      const enriched = flows
        .map((f) => {
          const tam = mode === "origin" ? baseTam : (tamMap[f.location] ?? 0);
          const marketPotential = Math.round(tam * (f.cardholderIndexSpend / 100));
          return {
            location:        f.location,
            name:            f.name,
            spendIndex:      f.cardholderIndexSpend,
            tam,
            marketPotential,
          };
        })
        .sort((a, b) => b.marketPotential - a.marketPotential);

      const totalMarketPotential = Math.round(enriched.reduce((s, f) => s + f.marketPotential, 0));

      return {
        district,
        yearPeriod,
        mode,
        flows: enriched,
        totalMarketPotential,
        totalLocations,
        unit: "£",
      };
    },
    {
      name: "getMarketPotential",
      description:
        "Calculate the monetary market potential (£) of spending flows.",
      schema: z.object({
        district:   z.string().describe("Postcode district code"),
        yearPeriod: z.string().describe("Period in 'YYYY#QN' format"),
        mode:       z.enum(["origin", "destination"]),
        topN:       z.number().optional().describe("Number of flows"),
      }),
    },
  );

  // 12. getInflowTAMSummary ───────────────────────────────────────────────────
  const getInflowTAMSummary = tool(
    async ({ district, yearPeriod, topN }) => {
      const { flows, totalLocations } = await getSpendingFlows.invoke({
        district,
        yearPeriod,
        mode: "destination",
        topN: topN ?? 1000,
      });

      if (!flows.length) {
        return { district, yearPeriod, totalSourceTAM: 0, tom: 0, sourceCount: 0, topSources: [] };
      }

      const counterparts = flows.map((f) => f.location);
      const tamMap: Record<string, number> = {};
      const batches: string[][] = [];
      for (let i = 0; i < counterparts.length; i += 10) {
        batches.push(counterparts.slice(i, i + 10));
      }
      const CONCURRENCY = 5;
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        await Promise.all(
          batches.slice(i, i + CONCURRENCY).map(async (batch) => {
            const { profiles } = await getDistrictProfile.invoke({ districts: batch });
            for (const p of profiles) tamMap[p.district] = p.tam;
          }),
        );
      }

      const enriched = flows.map((f) => ({
        location:        f.location,
        name:            f.name,
        spendIndex:      f.spend,
        sourceTam:       tamMap[f.location] ?? 0,
        marketPotential: Math.round((tamMap[f.location] ?? 0) * (f.spend / 100)),
      }));

      const totalSourceTAM   = Math.round(enriched.reduce((s, f) => s + f.sourceTam, 0));
      const tom               = Math.round(enriched.reduce((s, f) => s + f.marketPotential, 0));
      const topSources        = [...enriched].sort((a, b) => b.marketPotential - a.marketPotential).slice(0, 20);

      return {
        district,
        yearPeriod,
        mode:           "destination",
        sourceCount:    totalLocations,
        fetchedCount:   flows.length,
        totalSourceTAM,
        tom,
        unit:           "£",
        topSources,
      };
    },
    {
      name: "getInflowTAMSummary",
      description:
        "Get total resident TAM of source districts and TOM.",
      schema: z.object({
        district:   z.string().describe("Destination district"),
        yearPeriod: z.string().describe("Period in 'YYYY#QN' format"),
        topN:       z.number().optional().describe("Max source districts"),
      }),
    },
  );

  // 13. getCustomerProfile ────────────────────────────────────────────────────
  const getCustomerProfile = tool(
    async ({ districts, yearPeriod, regionName, topN }) => {
      const FLOW_CONCURRENCY    = 10;
      const PROFILE_BATCH       = 10;
      const PROFILE_CONCURRENCY = 3;
      const wantTop = topN ?? 30;

      type RawFlow = { cardholderLocation?: string; cardholderIndexSpend: number };

      const originScores = new Map<string, { score: number; appearances: number }>();

      const distBatches: string[][] = [];
      for (let i = 0; i < districts.length; i += FLOW_CONCURRENCY) {
        distBatches.push(districts.slice(i, i + FLOW_CONCURRENCY));
      }

      for (const batch of distBatches) {
        await Promise.all(batch.map(async (dest) => {
          try {
            const rows = await gqlPaginate<RawFlow>(
              Q_FLOWS_BY_MERCHANT,
              { loc: dest, yp: yearPeriod },
              token,
              "listSpendRecordByMerchantLocationAndYearPeriod",
              3,
            );
            for (const r of rows) {
              const origin = r.cardholderLocation?.toUpperCase();
              if (!origin || origin === "UNKNOWN") continue;
              const entry = originScores.get(origin);
              if (entry) {
                entry.score += r.cardholderIndexSpend;
                entry.appearances += 1;
              } else {
                originScores.set(origin, { score: r.cardholderIndexSpend, appearances: 1 });
              }
            }
          } catch { /* skip */ }
        }));
      }

      if (originScores.size === 0) {
        return { regionName, destinationCount: districts.length, topOriginDistricts: [], customerProfile: null };
      }

      const sorted = Array.from(originScores.entries())
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, wantTop);

      const topCodes = sorted.map(([code]) => code);

      const allProfiles: DistrictProfile[] = [];
      const profBatches: string[][] = [];
      for (let i = 0; i < topCodes.length; i += PROFILE_BATCH) {
        profBatches.push(topCodes.slice(i, i + PROFILE_BATCH));
      }
      for (let i = 0; i < profBatches.length; i += PROFILE_CONCURRENCY) {
        await Promise.all(
          profBatches.slice(i, i + PROFILE_CONCURRENCY).map(async (batch) => {
            const res = await getDistrictProfile.invoke({ districts: batch });
            const { profiles } = res as { profiles: DistrictProfile[] };
            allProfiles.push(...profiles);
          }),
        );
      }

      const valid = allProfiles.filter((p) => p.population > 0);
      const totalHouseholds = valid.reduce((s, p) => s + p.households, 0);

      const customerProfile = valid.length ? {
        population: valid.reduce((s, p) => s + p.population, 0),
        female:     valid.reduce((s, p) => s + p.female, 0),
        male:       valid.reduce((s, p) => s + p.male, 0),
        age_0_15:   valid.reduce((s, p) => s + p.age_0_15, 0),
        age_16_24:  valid.reduce((s, p) => s + p.age_16_24, 0),
        age_25_34:  valid.reduce((s, p) => s + p.age_25_34, 0),
        age_35_49:  valid.reduce((s, p) => s + p.age_35_49, 0),
        age_50_64:  valid.reduce((s, p) => s + p.age_50_64, 0),
        over_65:    valid.reduce((s, p) => s + p.over_65, 0),
        households: totalHouseholds,
        families:   valid.reduce((s, p) => s + p.families, 0),
        over66:     valid.reduce((s, p) => s + p.over66, 0),
        students:   valid.reduce((s, p) => s + p.students, 0),
        working:    valid.reduce((s, p) => s + p.working, 0),
        tam:        valid.reduce((s, p) => s + p.tam, 0),
        gdhi: Math.round(
          (valid.reduce((s, p) => s + p.gdhi * p.households, 0) / (totalHouseholds || 1)) * 100,
        ) / 100,
      } : null;

      return {
        regionName: regionName ?? `${districts.length} districts`,
        destinationCount: districts.length,
        topOriginDistricts: sorted.map(([code, stats]) => ({
          location:    code,
          name:        nameMap[code],
          score:       Math.round(stats.score * 100) / 100,
          appearances: stats.appearances,
        })),
        customerProfile,
      };
    },
    {
      name: "getCustomerProfile",
      description:
        "Build customer profile for a region based on top source districts.",
      schema: z.object({
        districts:  z.array(z.string()).min(1).describe("Destination districts"),
        yearPeriod: z.string().describe("Period in 'YYYY#QN' format"),
        regionName: z.string().optional().describe("Region name"),
        topN:       z.number().min(5).max(50).optional().describe("Top N origin districts"),
      }),
    },
  );

  // 14. getRegionProfile ──────────────────────────────────────────────────────
  const getRegionProfile = tool(
    async ({ districts, regionName }) => {
      const allProfiles: DistrictProfile[] = [];
      const BATCH_SIZE  = 10;
      const CONCURRENCY = 3;

      const batches: string[][] = [];
      for (let i = 0; i < districts.length; i += BATCH_SIZE) {
        batches.push(districts.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        await Promise.all(
          batches.slice(i, i + CONCURRENCY).map(async (batch) => {
            const res = await getDistrictProfile.invoke({ districts: batch });
            const { profiles } = res as { profiles: DistrictProfile[] };
            allProfiles.push(...profiles);
          }),
        );
      }

      const valid = allProfiles.filter((p) => p.population > 0);
      if (!valid.length) {
        return { regionName, districtCount: 0, error: "No demographic data found" };
      }

      const totalHouseholds = valid.reduce((s, p) => s + p.households, 0);

      const aggregated = {
        population: valid.reduce((s, p) => s + p.population, 0),
        female:     valid.reduce((s, p) => s + p.female, 0),
        male:       valid.reduce((s, p) => s + p.male, 0),
        age_0_15:   valid.reduce((s, p) => s + p.age_0_15, 0),
        age_16_24:  valid.reduce((s, p) => s + p.age_16_24, 0),
        age_25_34:  valid.reduce((s, p) => s + p.age_25_34, 0),
        age_35_49:  valid.reduce((s, p) => s + p.age_35_49, 0),
        age_50_64:  valid.reduce((s, p) => s + p.age_50_64, 0),
        over_65:    valid.reduce((s, p) => s + p.over_65, 0),
        households: totalHouseholds,
        families:   valid.reduce((s, p) => s + p.families, 0),
        over66:     valid.reduce((s, p) => s + p.over66, 0),
        students:   valid.reduce((s, p) => s + p.students, 0),
        working:    valid.reduce((s, p) => s + p.working, 0),
        tam:        valid.reduce((s, p) => s + p.tam, 0),
        gdhi: Math.round(
          (valid.reduce((s, p) => s + p.gdhi * p.households, 0) / (totalHouseholds || 1)) * 100,
        ) / 100,
      };

      return {
        regionName: regionName ?? `${valid.length} districts`,
        districtCount: valid.length,
        districts:     valid.map((p) => p.district),
        ...aggregated,
      };
    },
    {
      name: "getRegionProfile",
      description:
        "Aggregate demographics for a region (multiple districts).",
      schema: z.object({
        districts:  z.array(z.string()).min(1).describe("District codes"),
        regionName: z.string().optional().describe("Region name"),
      }),
    },
  );

  return [
    resolveDistricts,
    resolveVenue,
    getSpendingFlows,
    getDistrictProfile,
    getSpendingTrend,
    compareDistricts,
    getTopDistricts,
    listVenuesInDistrict,
    getDistrictsInRadius,
    getTravelTimeDistricts,
    getAreaZones,
    getMarketPotential,
    getInflowTAMSummary,
    getCustomerProfile,
    getRegionProfile,
  ];
}

const SPATIAL_TOOLS = new Set([
  "resolveDistricts",
  "resolveVenue",
  "listVenuesInDistrict",
  "getDistrictsInRadius",
  "getTravelTimeDistricts",
]);

const DATA_TOOLS = new Set([
  "getSpendingFlows",
  "getDistrictProfile",
  "getSpendingTrend",
  "getCustomerProfile",
  "getRegionProfile",
]);

export function createSpatialTools(token: string) {
  return createTools(token).filter(t => SPATIAL_TOOLS.has(t.name));
}

export function createDataTools(token: string) {
  return createTools(token).filter(t => DATA_TOOLS.has(t.name));
}
