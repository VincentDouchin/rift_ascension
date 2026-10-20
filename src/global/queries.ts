import type { World } from 'miniplex'
import type { Entity } from './entity'
import { added } from '~/lib/customQueries'

export const queries = (ecs: World<Entity>) => {
	return {
		characters: ecs.with('characterAnimator'),
		gameStateGameAdded: added(ecs.with('GameState').where((e) => e.GameState.state === 'game')),
		charactersAdded: added(ecs.with('characterAnimator')),
	}
}
