// This file is auto-generated. Do not edit it manually.


export type StaticAssetPath =
  'characters/Paladin/shadow.json' |
  'characters/Paladin/shadow.png' |
  'characters/Paladin/spritesheet.json' |
  'characters/Paladin/spritesheet.png';

/**
 * Represents the known directories containing static assets.
 * '.' represents the root directory.
 */
export type StaticAssetDirectory =
  'characters/' |
  'characters/Paladin/';

/**
 * Represents the relative paths of files located *directly* within a specific directory.
 * Use '.' for the root directory.
 * @template Dir - A directory path string literal type from StaticAssetDirectory (e.g., 'icons/', 'icons/sun/', '.').
 */
export type FilesInFolder<Dir extends '.' | StaticAssetDirectory> = 
  Dir extends '.'
    ? Exclude<StaticAssetPath, `${string}/${string}`>
    : Extract<StaticAssetPath, `${Dir}${string}`> extends infer Match
      ? Match extends `${Dir}${infer FileName}`
        ? FileName extends `${string}/${string}`
          ? never
          : Match
        : never
      : never;



export const assets = new Set<string>([
  'characters/Paladin/shadow.json',
  'characters/Paladin/shadow.png',
  'characters/Paladin/spritesheet.json',
  'characters/Paladin/spritesheet.png'
]);

// Store basePath resolved from Vite config
const BASE_PATH = "/";


/**
 * Gets the URL for a specific static asset
 * @param path Path to the asset
 * @returns The URL for the asset
 */
export function staticAssets(path: StaticAssetPath): string {
  if (!assets.has(path)) {
    throw new Error(
      "Static asset does not exist in static assets directory"
    );
  }
  return `${BASE_PATH}${path}`;
}

