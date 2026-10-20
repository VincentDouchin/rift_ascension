import type { Simplify } from 'type-fest'

type ExtractFromPath<T extends string, F extends string, P extends string, S extends string, E extends string> = {
	[Path in T]: Path extends `${F}/${P}${infer R}${S}.${E}` ? R : never
}[T]
const escapeRegex = (str?: string) => (str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const getAssetPathsLoader =
	<Paths extends string>(assetNames: Set<string>, assetPaths: Record<string, string>) =>
	<F extends string = '', P extends string = '', S extends string = '', E extends string = '', L extends boolean = false>({
		folder,
		suffix,
		extension,
		lowercase,
		prefix,
	}: {
		folder?: F
		suffix?: S
		extension: E
		lowercase?: L
		prefix?: P
	}) => {
		const escapedPrefix = escapeRegex(prefix)
		const escapedFolder = escapeRegex(folder)
		const escapedSuffix = escapeRegex(suffix)
		const escapedExtension = escapeRegex(extension)
		const regex = new RegExp(`${escapedFolder}/${escapedPrefix}(.*?)${escapedSuffix}.${escapedExtension}`)
		return [...assetNames]
			.filter((assets) => assets.match(regex)?.[0])
			.reduce((acc, v) => {
				const realPath = Object.entries(assetPaths).find(([rawPath, _realPath]) => rawPath.endsWith(v))?.[1]
				if (!realPath) {
					throw new Error(`${v} does not exist`)
				}
				let fileName = regex.exec(v)![1]
				if (lowercase) {
					fileName = fileName.toLocaleLowerCase()
				}
				return { ...acc, [fileName]: realPath }
			}, {}) as L extends true ? Simplify<Record<Lowercase<ExtractFromPath<Paths, F, P, S, E>>, string>> : Simplify<Record<ExtractFromPath<Paths, F, P, S, E>, string>>
	}

export const loadImage = (src: string) => {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = src
	})
}
