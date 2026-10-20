import { WebGPURenderer } from 'three/webgpu'
import { GameLoop } from '~/lib/gameLoop'
import { resources } from '~/global/resources'
import { onGameStarted, startGame } from '~/game/init'
import { addCharactersToFlatLand, updateCharacters } from '~/global/sprites'

const renderer = new WebGPURenderer()
await renderer.init()
document.body.appendChild(renderer.domElement)

function resizeRenderer() {
	renderer.setSize(window.innerWidth, window.innerHeight)
}
resizeRenderer()
window.addEventListener('resize', resizeRenderer)

await new GameLoop(resources, { fps: 60 })
	.onFixedUpdate((r, stepMs) => {
		updateCharacters(r, stepMs)
	})
	.onUpdate((r, _deltaMs) => {
		onGameStarted(r)
		addCharactersToFlatLand(r)
	})
	.onRender((r) => {
		r.flatland.render(renderer)
	})
	.start(startGame)
