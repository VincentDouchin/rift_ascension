import path from 'node:path'
import { defineConfig } from 'vite-plus'
import staticAssetsPlugin from './plugins/static-assets'
import spriteSheetsPlugin from './plugins/sprite-sheets'

export default defineConfig({
	plugins: [
		staticAssetsPlugin({ outputFile: 'src/static-assets.ts', directory: 'assets' }),
		spriteSheetsPlugin([{ directory: 'spriteSheets/characters', outputDirectory: 'assets/characters', tileWidth: 32, tileHeight: 32 }]),
	],
	resolve: {
		alias: [
			{ find: '~', replacement: path.resolve(import.meta.dirname, './src') },
			{ find: '@', replacement: path.resolve(import.meta.dirname, './assets') },
		],
	},
	staged: {
		'*': 'vp check --fix',
	},
	fmt: {
		semi: false,
		printWidth: 200,
		singleQuote: true,
		tabWidth: 4,
		objectWrap: 'preserve',
		proseWrap: 'preserve',
		useTabs: true,
		embeddedLanguageFormatting: 'auto',
		ignorePatterns: ['dev-dist', 'assets', 'node-modules', 'dist', 'public', 'src-tauri', 'editor/src-tauri', 'src/static-assets.ts'],
		singleAttributePerLine: true,
	},
	lint: {
		jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
		rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
		options: { typeAware: true, typeCheck: true },
	},
})
