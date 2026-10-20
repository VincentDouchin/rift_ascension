import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import type { Plugin } from 'vite-plus'
import type { SpriteSheetJSONHash } from 'three-flatland'

const defaultDirections = ['down-right', 'down-left', 'up-right', 'up-left'] as const
type Direction = (typeof defaultDirections)[number]

export interface SpriteSheetsOptions {
	directory: string
	tileWidth: number
	tileHeight: number
	outputDirectory?: string
	directions?: readonly Direction[]
	fps?: number
}

export interface SpriteSheetsPluginOptions {
	animationsFile?: string
}

interface Source {
	file: string
	animation: string
	shadow: boolean
	columns: number
	rows: number
}

export interface GeneratedAtlas {
	fileName: string
	image: Buffer
	json: SpriteSheetJSONHash
}

function validateOptions(options: SpriteSheetsOptions) {
	if (!options.directory) throw new Error('sprite-sheets: directory is required')
	for (const size of [options.tileWidth, options.tileHeight]) {
		if (!Number.isSafeInteger(size) || size <= 0) throw new Error('sprite-sheets: tile dimensions must be positive integers')
	}
	const directions = options.directions ?? defaultDirections
	if (directions.length !== 4 || new Set(directions).size !== 4 || directions.some((direction) => !defaultDirections.includes(direction))) {
		throw new Error('sprite-sheets: directions must contain each of the four directions exactly once')
	}
	if (!Number.isFinite(options.fps ?? 12) || (options.fps ?? 12) <= 0) throw new Error('sprite-sheets: fps must be positive')
	const output = options.outputDirectory ?? 'generated/spritesheets'
	if (!output || output.includes('\\') || output.startsWith('/') || output.includes(':') || output.split('/').some((part) => !part || part === '..' || part === '.')) {
		throw new Error('sprite-sheets: outputDirectory must be a relative URL path without traversal')
	}
}

async function readSources(directory: string, character: string, options: SpriteSheetsOptions): Promise<Source[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = entries
		.filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
		.map((entry) => entry.name)
		.sort()
	const sources: Source[] = []
	const names = new Set<string>()
	for (const file of files) {
		let stem = file.slice(0, -4)
		const shadow = /Shadow$/i.test(stem)
		if (shadow) stem = stem.slice(0, -6)
		if (stem.toLowerCase().startsWith(character.toLowerCase())) stem = stem.slice(character.length)
		const animation = stem
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
			.replace(/[^a-zA-Z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.toLowerCase()
		const key = `${shadow}:${animation}`
		if (!animation || names.has(key)) throw new Error(`sprite-sheets: empty or duplicate animation name in ${directory}/${file}`)
		names.add(key)
		const metadata = await sharp(path.join(directory, file)).metadata()
		const columns = (metadata.width ?? 0) / options.tileWidth
		const rows = (metadata.height ?? 0) / options.tileHeight
		if (!Number.isInteger(columns) || columns < 1 || (rows !== 1 && rows !== 4)) {
			throw new Error(`sprite-sheets: ${directory}/${file} must contain whole ${options.tileWidth}x${options.tileHeight} tiles in 1 or 4 rows`)
		}
		sources.push({ file: path.join(directory, file), animation, shadow, columns, rows })
	}
	const regular = sources.filter((source) => !source.shadow)
	const shadows = sources.filter((source) => source.shadow)
	if (shadows.length) {
		if (regular.length !== shadows.length) throw new Error(`sprite-sheets: ${directory} has missing regular/shadow animation pairs`)
		for (const source of regular) {
			const shadow = shadows.find((candidate) => candidate.animation === source.animation)
			if (!shadow || shadow.columns !== source.columns || shadow.rows !== source.rows) {
				throw new Error(`sprite-sheets: ${directory}/${source.animation} has a missing or mismatched shadow`)
			}
		}
	}
	return sources
}

async function composeAtlas(sources: Source[], fileName: string, options: SpriteSheetsOptions): Promise<GeneratedAtlas> {
	const { tileWidth, tileHeight } = options
	const directions = options.directions ?? defaultDirections
	const count = sources.reduce((total, source) => total + source.columns * source.rows, 0)
	const columns = Math.max(1, Math.ceil(Math.sqrt((count * tileHeight) / tileWidth)))
	const width = columns * tileWidth
	const height = Math.ceil(count / columns) * tileHeight
	if (width > 8192 || height > 8192) throw new Error(`sprite-sheets: ${fileName} exceeds the 8192px atlas limit`)
	const json: SpriteSheetJSONHash = {
		frames: {},
		meta: { image: path.posix.basename(fileName), size: { w: width, h: height }, scale: '1', animations: {} },
	}
	const layers: OverlayOptions[] = []
	let index = 0
	for (const source of sources) {
		const input = sharp(source.file)
		for (let row = 0; row < source.rows; row++) {
			const frameSet: string[] = []
			for (let column = 0; column < source.columns; column++) {
				const name = `${source.animation}-${directions[row]}_${column}`
				const left = (index % columns) * tileWidth
				const top = Math.floor(index / columns) * tileHeight
				const frame = { x: left, y: top, w: tileWidth, h: tileHeight }
				json.frames[name] = {
					frame,
					rotated: false,
					trimmed: false,
					spriteSourceSize: { x: 0, y: 0, w: tileWidth, h: tileHeight },
					sourceSize: { w: tileWidth, h: tileHeight },
				}
				const pixels = await input
					.clone()
					.extract({ left: column * tileWidth, top: row * tileHeight, width: tileWidth, height: tileHeight })
					.png()
					.toBuffer()
				layers.push({ input: pixels, left, top })
				frameSet.push(name)
				index++
			}
			const names = source.rows === 1 ? directions : [directions[row]]
			for (const direction of names) {
				json.meta.animations![`${source.animation}-${direction}`] = {
					frameSet: [...frameSet],
					frames: frameSet.map((_, frameIndex) => frameIndex),
					fps: options.fps ?? 12,
					loop: true,
				}
			}
		}
	}
	const image = await sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
		.composite(layers)
		.png()
		.toBuffer()
	return { fileName, image, json }
}

export async function generateSpriteSheets(options: SpriteSheetsOptions, root = process.cwd()): Promise<GeneratedAtlas[]> {
	validateOptions(options)
	const directory = path.resolve(root, options.directory)
	const output = path.resolve(root, options.outputDirectory ?? 'generated/spritesheets')
	const relativeOutput = path.relative(directory, output)
	if (!relativeOutput || (!relativeOutput.startsWith(`..${path.sep}`) && relativeOutput !== '..' && !path.isAbsolute(relativeOutput))) {
		throw new Error('sprite-sheets: outputDirectory must be outside the source directory')
	}
	const folders = (await readdir(directory, { withFileTypes: true }))
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()
	const atlases: GeneratedAtlas[] = []
	for (const character of folders) {
		const sources = await readSources(path.join(directory, character), character, options)
		for (const shadow of [false, true]) {
			const group = sources.filter((source) => source.shadow === shadow)
			if (!group.length) continue
			const fileName = `${options.outputDirectory ?? 'generated/spritesheets'}/${character}/${shadow ? 'shadow' : 'spritesheet'}.png`
			atlases.push(await composeAtlas(group, fileName, options))
		}
	}
	return atlases
}

export default function spriteSheetsPlugin(input: SpriteSheetsOptions | readonly SpriteSheetsOptions[], pluginOptions: SpriteSheetsPluginOptions = {}): Plugin {
	const inputs = Array.isArray(input) ? (input as readonly SpriteSheetsOptions[]) : [input as SpriteSheetsOptions]
	for (const options of inputs) validateOptions(options)
	const animationsFile = pluginOptions.animationsFile ?? 'src/sprite-animations.ts'
	if (
		!animationsFile.endsWith('.ts') ||
		animationsFile.includes('\\') ||
		animationsFile.includes(':') ||
		animationsFile.startsWith('/') ||
		animationsFile.split('/').some((part) => !part || part === '..' || part === '.')
	) {
		throw new Error('sprite-sheets: animationsFile must be a relative .ts path without traversal')
	}
	let root = process.cwd()
	let assets = new Map<string, Buffer>()
	let generation = Promise.resolve()
	const regenerate = () => {
		generation = generation
			.catch(() => {})
			.then(async () => {
				const sourceDirectories = inputs.map((options) => path.resolve(root, options.directory))
				const destinations = [...inputs.map((options) => options.outputDirectory ?? 'generated/spritesheets'), animationsFile]
				for (const destination of destinations) {
					for (const source of sourceDirectories) {
						const relative = path.relative(source, path.resolve(root, destination))
						if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
							throw new Error('sprite-sheets: generated files must be outside every source directory')
						}
					}
				}
				const atlases: GeneratedAtlas[] = []
				for (const options of inputs) atlases.push(...(await generateSpriteSheets(options, root)))
				const next = new Map<string, Buffer>()
				const characters = new Map<string, string[]>()
				for (const atlas of atlases) {
					if (next.has(atlas.fileName)) throw new Error(`sprite-sheets: duplicate output ${atlas.fileName}`)
					next.set(atlas.fileName, atlas.image)
					next.set(atlas.fileName.replace(/\.png$/, '.json'), Buffer.from(JSON.stringify(atlas.json, null, 2)))
					if (path.posix.basename(atlas.fileName) === 'spritesheet.png') {
						const character = path.posix.basename(path.posix.dirname(atlas.fileName))
						if (characters.has(character)) throw new Error(`sprite-sheets: duplicate character ${character} across inputs`)
						characters.set(character, Object.keys(atlas.json.meta.animations ?? {}).sort())
					}
				}
				const names = Object.fromEntries([...characters].sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0)))
				const typescript = `export const animationNames = ${JSON.stringify(names, null, '\t')} as const\n\nexport type Character = keyof typeof animationNames\nexport type AnimationName<CharacterName extends Character> = (typeof animationNames)[CharacterName] extends readonly (infer Name extends string)[] ? Name : never\n`
				const files = new Map(next)
				files.set(animationsFile, Buffer.from(typescript))
				for (const [fileName, content] of files) {
					const destination = path.resolve(root, fileName)
					const existing = await readFile(destination).catch((error: NodeJS.ErrnoException) => {
						if (error.code !== 'ENOENT') throw error
						return undefined
					})
					if (existing?.equals(content)) continue
					await mkdir(path.dirname(destination), { recursive: true })
					await writeFile(destination, content)
				}
				for (const fileName of assets.keys()) {
					if (!next.has(fileName))
						await unlink(path.resolve(root, fileName)).catch((error: NodeJS.ErrnoException) => {
							if (error.code !== 'ENOENT') throw error
						})
				}
				assets = next
			})
		return generation
	}
	return {
		name: 'sprite-sheets',
		configResolved(config) {
			root = config.root
		},
		buildStart: {
			order: 'pre',
			sequential: true,
			async handler() {
				for (const options of inputs) this.addWatchFile(path.resolve(root, options.directory))
				await regenerate()
			},
		},
		configureServer(server) {
			const directories = inputs.map((options) => path.resolve(root, options.directory))
			let timer: ReturnType<typeof setTimeout> | undefined
			const changed = (_event: string, file: string) => {
				const isSource = directories.some((directory) => {
					const relative = path.relative(directory, path.resolve(file))
					return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
				})
				if (!isSource) return
				clearTimeout(timer)
				timer = setTimeout(() => {
					void regenerate()
						.then(() => server.ws.send({ type: 'full-reload' }))
						.catch((error: Error) => {
							server.config.logger.error(error.message)
							server.ws.send({ type: 'error', err: { message: error.message, stack: error.stack ?? '', plugin: 'sprite-sheets' } })
						})
				}, 100)
			}
			server.watcher.add(directories)
			server.watcher.on('all', changed)
			server.httpServer?.once('close', () => {
				clearTimeout(timer)
				server.watcher.off('all', changed)
			})
		},
		generateBundle() {
			for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source })
		},
	}
}
