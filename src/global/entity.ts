import type { CharacterAnimator } from '~/lib/characterAnimator'

export interface Entity {
	GameState?: {
		state: 'game'
	}
	characterAnimator?: CharacterAnimator
}
