import { z } from "zod";

export const sesRegionSchema = z.string().trim().min(1, "Region is required");

export function getValidSesRegions(regions: string[]) {
  return [...new Set(regions.map((region) => region.trim()).filter(Boolean))];
}
