import { AnimatedSprite2D, SortLayers, SpriteGroup, type PlayOptions, type SpriteSheet } from 'three-flatland'

class CharacterAnimatedSprite extends AnimatedSprite2D {
	vertical: 'up' | 'down' = 'down'
	horizontal: 'left' | 'right' = 'left'

	// play(animation: string, options?: PlayOptions) {
	// 	return super.play(`${animation}-${this.vertical}-${this.horizontal}`, options)
	// }
}

export class CharacterAnimator extends SpriteGroup {
	front: CharacterAnimatedSprite
	shadow: CharacterAnimatedSprite
	constructor(front: SpriteSheet, shadow: SpriteSheet) {
		super()
		this.front = new CharacterAnimatedSprite({ spriteSheet: front, animation: 'idle-down-left' })
		this.shadow = new CharacterAnimatedSprite({ spriteSheet: shadow, animation: 'idle-down-left' })
		this.shadow.sortLayer = SortLayers.SHADOWS
		this.add(this.front)
		this.add(this.shadow)
	}
	async play(animation: string, options?: PlayOptions) {
		return new Promise<void>((res) => {
			this.front.play(animation, {
				...options,
				onComplete: () => {
					options?.onComplete?.()
					res()
				},
			})
			this.shadow.play(animation, {
				...options,
				onComplete: undefined,
			})
		})
	}
	pause() {
		this.front.pause()
		this.shadow.pause()
	}
	updateAnimations(ms: number) {
		this.front.update(ms)
		this.shadow.update(ms)
	}
}
