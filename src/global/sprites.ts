import type { Resources } from './resources'

export const addCharactersToFlatLand = ({ queries, flatland }: Resources) => {
	for (const entity of queries.charactersAdded) {
		flatland.add(entity.characterAnimator)
		console.log('ok')
	}
}

export const updateCharacters = ({ queries }: Resources, ms: number) => {
	for (const entity of queries.characters) {
		entity.characterAnimator.updateAnimations(ms)
	}
}
