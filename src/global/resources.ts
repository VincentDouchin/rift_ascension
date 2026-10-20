import { World } from 'miniplex'
import type { Entity } from './entity'
import { queries } from './queries'
import assets from '~/global/assets'
import { Flatland } from 'three-flatland/react'

export const resources = async (): Promise<Resources> => {
	const ecs = new World<Entity>()
	return {
		ecs,
		queries: queries(ecs),
		assets: await assets(),
		flatland: new Flatland({ viewSize: 200, clearColor: 0xffffff }),
	}
}
export interface Resources {
	ecs: World<Entity>
	queries: ReturnType<typeof queries>
	assets: Awaited<ReturnType<typeof import('~/global/assets').default>>
	flatland: Flatland
}
