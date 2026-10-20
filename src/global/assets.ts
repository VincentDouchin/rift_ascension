import { SpriteSheetLoader } from 'three-flatland'
import { getAssetPathsLoader } from '~/lib/assetLoader'
import { asyncMapValues } from '~/lib/mapFunctions'
import { assets, type StaticAssetPath } from '~/static-assets'
import { CharacterAnimator } from '../lib/characterAnimator'

const characterLoader = async () => {
	const assetPaths = import.meta.glob('@/**/**.*', { eager: true, query: '?url', import: 'default' })
	const assetPathsLoader = getAssetPathsLoader<StaticAssetPath>(assets, assetPaths)
	const paladinFiles = assetPathsLoader({ folder: 'characters/Paladin', extension: 'json' })
	const animatedSpriteSheets = await asyncMapValues(paladinFiles, (path) => SpriteSheetLoader.load(path))
	const paladin = new CharacterAnimator(animatedSpriteSheets.spritesheet, animatedSpriteSheets.shadow)
	return paladin
}

export default async () => ({
	paladin: await characterLoader(),
})
