import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import sharp from 'sharp'
import { SpriteSheetLoader } from 'three-flatland'
import { build, createServer } from 'vite-plus'
import spriteSheetsPlugin, { generateSpriteSheets } from './sprite-sheets.ts'

const options = { directory: 'spriteSheets/characters', tileWidth: 32, tileHeight: 32 }

void test('Paladin atlases have matching animations, valid loader frames, and preserved pixels', async () => {
	const atlases = await generateSpriteSheets(options)
	assert.equal(atlases.length, 2)
	const [regular, shadow] = atlases
	assert.deepEqual(regular.json.meta.animations, shadow.json.meta.animations)
	assert.equal(Object.keys(regular.json.meta.animations!).length, 44)
	assert.equal(Object.keys(regular.json.frames).length, 408)
	const loader = SpriteSheetLoader as unknown as { parseJSONHash(json: typeof regular.json): { frames: Map<string, unknown> } }
	assert.equal(loader.parseJSONHash(regular.json).frames.size, 408)
	const idle = regular.json.meta.animations!['idle-down-left']
	assert.equal(idle.frames.length, 12)
	const first = regular.json.frames[idle.frameSet[0]].frame
	const actual = await sharp(regular.image).extract({ left: first.x, top: first.y, width: first.w, height: first.h }).raw().toBuffer()
	const expected = await sharp('spriteSheets/characters/Paladin/PaladinIdle.png').extract({ left: 0, top: 32, width: 32, height: 32 }).ensureAlpha().raw().toBuffer()
	assert.deepEqual(actual, expected)
	const die = regular.json.meta.animations!['die-down-right']
	for (const direction of ['down-left', 'up-right', 'up-left']) assert.deepEqual(regular.json.meta.animations![`die-${direction}`], die)
	for (const atlas of atlases) {
		const metadata = await sharp(atlas.image).metadata()
		assert.equal(metadata.width, atlas.json.meta.size.w)
		assert.equal(metadata.height, atlas.json.meta.size.h)
		const positions = new Set<string>()
		for (const { frame } of Object.values(atlas.json.frames)) {
			assert.ok(frame.x + frame.w <= metadata.width! && frame.y + frame.h <= metadata.height!)
			positions.add(`${frame.x},${frame.y}`)
		}
		assert.equal(positions.size, Object.keys(atlas.json.frames).length)
	}
	const repeated = await generateSpriteSheets(options)
	assert.deepEqual(repeated, atlases)
})

void test('validates layouts, shadow pairs, and normalized animation collisions', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'sprite-sheets-'))
	const folder = path.join(root, 'characters', 'Hero')
	await mkdir(folder, { recursive: true })
	const settings = { directory: 'characters', tileWidth: 32, tileHeight: 32 }
	const image = (width: number, height: number) =>
		sharp({ create: { width, height, channels: 4, background: '#ff0000' } })
			.png()
			.toBuffer()
	try {
		await writeFile(path.join(folder, 'HeroIdle.png'), await image(33, 32))
		await assert.rejects(generateSpriteSheets(settings, root), /whole 32x32 tiles/)
		await writeFile(path.join(folder, 'HeroIdle.png'), await image(64, 128))
		await writeFile(path.join(folder, 'HeroIdleShadow.png'), await image(32, 128))
		await assert.rejects(generateSpriteSheets(settings, root), /mismatched shadow/)
		await rm(path.join(folder, 'HeroIdleShadow.png'))
		await writeFile(path.join(folder, 'Hero-idle.png'), await image(64, 128))
		await assert.rejects(generateSpriteSheets(settings, root), /duplicate animation/)
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})

void test('rejects invalid plugin settings', async () => {
	await assert.rejects(generateSpriteSheets({ ...options, tileWidth: 0 }), /positive integers/)
	await assert.rejects(generateSpriteSheets({ ...options, outputDirectory: '../outside' }), /relative URL path/)
	await assert.rejects(generateSpriteSheets({ ...options, directions: ['down-left'] }), /four directions/)
	await assert.rejects(generateSpriteSheets({ ...options, outputDirectory: 'spriteSheets/characters/output' }), /outside the source/)
	assert.throws(() => spriteSheetsPlugin([options], { animationsFile: '../outside.ts' }), /relative .ts path/)
})

void test('development writes and serves files without touching originals or rewriting identical output', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'sprite-sheets-dev-'))
	const folder = path.join(root, 'originals', 'Hero')
	await mkdir(folder, { recursive: true })
	const source = await sharp({ create: { width: 64, height: 32, channels: 4, background: '#ff0000' } })
		.png()
		.toBuffer()
	const sourceFile = path.join(folder, 'HeroIdle.png')
	await writeFile(sourceFile, source)
	await writeFile(path.join(folder, 'HeroIdleShadow.png'), source)
	const sourceStat = await stat(sourceFile)
	const settings = { directory: 'originals', outputDirectory: 'assets/characters', tileWidth: 32, tileHeight: 32 }
	const secondFolder = path.join(root, 'small-originals', 'Mage')
	await mkdir(secondFolder, { recursive: true })
	await writeFile(
		path.join(secondFolder, 'MageWalk.png'),
		await sharp({ create: { width: 48, height: 64, channels: 4, background: '#00ff00' } })
			.png()
			.toBuffer(),
	)
	const inputs = [settings, { directory: 'small-originals', outputDirectory: 'assets/small', tileWidth: 16, tileHeight: 16 }]
	const server = await createServer({ configFile: false, root, base: '/game/', plugins: [spriteSheetsPlugin(inputs)], server: { port: 0, watch: null } })
	try {
		await server.listen()
		const address = server.httpServer!.address()
		assert.ok(address && typeof address !== 'string')
		const url = `http://localhost:${address.port}/game/assets/characters/Hero/`
		for (const stem of ['spritesheet', 'shadow']) {
			const jsonFile = path.join(root, 'assets', 'characters', 'Hero', `${stem}.json`)
			const json = JSON.parse(await readFile(jsonFile, 'utf8'))
			assert.equal(Object.keys(json.meta.animations).length, 4)
			const response = await fetch(`${url}${stem}.json`)
			assert.equal(response.status, 200)
			assert.match(response.headers.get('content-type') ?? '', /application\/json/)
			assert.deepEqual(await response.json(), json)
			const image = await fetch(`${url}${json.meta.image}`)
			assert.equal(image.headers.get('content-type'), 'image/png')
			assert.deepEqual(Buffer.from(await image.arrayBuffer()), await readFile(path.join(path.dirname(jsonFile), `${stem}.png`)))
			for (const extension of ['png', 'json']) {
				const module = await fetch(`${url}${stem}.${extension}?import&url`)
				assert.equal(module.status, 200)
				assert.match(module.headers.get('content-type') ?? '', /javascript/)
				assert.match(await module.text(), /export default/)
			}
		}
		const output = path.join(root, 'assets', 'characters', 'Hero', 'spritesheet.png')
		const before = await stat(output)
		const animationsFile = path.join(root, 'src', 'sprite-animations.ts')
		const animationSource = await readFile(animationsFile, 'utf8')
		const generated = await import(pathToFileURL(animationsFile).href)
		assert.deepEqual(Object.keys(generated.animationNames), ['Hero', 'Mage'])
		assert.deepEqual(generated.animationNames.Hero, ['idle-down-left', 'idle-down-right', 'idle-up-left', 'idle-up-right'])
		assert.deepEqual(generated.animationNames.Mage, ['walk-down-left', 'walk-down-right', 'walk-up-left', 'walk-up-right'])
		assert.match(animationSource, /export type AnimationName<CharacterName extends Character>/)
		const mage = JSON.parse(await readFile(path.join(root, 'assets', 'small', 'Mage', 'spritesheet.json'), 'utf8'))
		assert.equal(mage.frames['walk-down-right_0'].frame.w, 16)
		const animationStat = await stat(animationsFile)
		await server.restart()
		assert.equal((await stat(output)).mtimeMs, before.mtimeMs)
		assert.equal((await stat(animationsFile)).mtimeMs, animationStat.mtimeMs)
		assert.equal((await stat(sourceFile)).mtimeMs, sourceStat.mtimeMs)
		assert.deepEqual(await readFile(sourceFile), source)
		await writeFile(path.join(root, 'index.html'), '<html><body>Atlas test</body></html>')
		const result = await build({ configFile: false, root, plugins: [spriteSheetsPlugin(inputs)], build: { write: false }, logLevel: 'silent' })
		assert.ok('output' in result)
		const emitted = result.output.filter((asset) => asset.fileName.startsWith('assets/characters/'))
		assert.equal(emitted.length, 4)
		assert.equal(result.output.filter((asset) => asset.fileName.startsWith('assets/small/')).length, 2)
		assert.equal(
			result.output.some((asset) => asset.fileName.endsWith('.ts')),
			false,
		)
		const runBuild = (configurations: typeof inputs, animationsFile?: string) =>
			build({ configFile: false, root, plugins: [spriteSheetsPlugin(configurations, { animationsFile })], build: { write: false }, logLevel: 'silent' })
		await assert.rejects(runBuild([settings, settings]), /duplicate output/)
		await assert.rejects(runBuild([settings, { ...settings, outputDirectory: 'assets/other' }]), /duplicate character/)
		await assert.rejects(runBuild([{ ...settings, outputDirectory: 'small-originals/generated' }, inputs[1]]), /outside every source/)
		await runBuild(inputs, 'src/custom-animations.ts')
		assert.equal(await readFile(path.join(root, 'src', 'custom-animations.ts'), 'utf8'), animationSource)
		await rm(path.join(secondFolder, 'MageWalk.png'))
		await server.restart()
		assert.equal((await readFile(animationsFile, 'utf8')).includes('Mage'), false)
		await assert.rejects(readFile(path.join(root, 'assets', 'small', 'Mage', 'spritesheet.json')), { code: 'ENOENT' })
		await runBuild([])
		assert.match(await readFile(animationsFile, 'utf8'), /animationNames = \{\} as const/)
	} finally {
		await server.close()
		await rm(root, { recursive: true, force: true })
	}
})
