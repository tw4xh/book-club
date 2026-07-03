declare module "zipcodes" {
  export interface ZipInfo {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }
  export function lookup(zip: string | number): ZipInfo | undefined;
  export function distance(zipA: string | number, zipB: string | number): number | null;
  export function radius(
    zip: string | number,
    miles: number,
    full?: boolean
  ): string[] | ZipInfo[];
  const _default: {
    lookup: typeof lookup;
    distance: typeof distance;
    radius: typeof radius;
  };
  export default _default;
}
