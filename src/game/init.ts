import type { Resources } from '~/global/resources'
export const startGame = ({ ecs }: Resources) => {
	ecs.add({ GameState: { state: 'game' } })
}

export const onGameStarted = ({ ecs, queries, assets }: Resources) => {
	for (const _ of queries.gameStateGameAdded) {
		ecs.add({ characterAnimator: assets.paladin })
	}
}
