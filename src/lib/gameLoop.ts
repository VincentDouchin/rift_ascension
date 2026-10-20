export type FixedUpdateCallback<R> = (resources: R, stepMs: number) => void
export type UpdateCallback<R> = (resources: R, deltaMs: number) => void
export type RenderCallback<R> = (resources: R, alpha: number, deltaMs: number) => void

export interface GameLoopOptions {
	/** Simulation rate of the fixed step, in updates per second */
	fps?: number
	/** Max fixed steps per frame, prevents the spiral of death after a long stall */
	maxStepsPerFrame?: number
	/** Clamp for frame delta (e.g. after tab switch or breakpoint) */
	maxDeltaMs?: number
}

export type ResourcesFactory<R> = () => R | Promise<R>

export class GameLoop<R> {
	readonly stepMs: number
	readonly maxStepsPerFrame: number
	readonly maxDeltaMs: number

	timeScale = 1
	/** Total simulated time advanced by fixed steps */
	fixedTime = 0
	/** Total (scaled) time advanced by variable updates */
	time = 0

	#fixedUpdates = new Set<FixedUpdateCallback<R>>()
	#updates = new Set<UpdateCallback<R>>()
	#renders = new Set<RenderCallback<R>>()

	#accumulator = 0
	#previousTime: number | null = null
	#frameId: number | null = null

	#resourcesFactory: ResourcesFactory<R>
	#resources: Promise<R> | null = null
	#loadedResources: R | null = null

	constructor(resources: ResourcesFactory<R>, { fps = 60, maxStepsPerFrame = 5, maxDeltaMs = 250 }: GameLoopOptions = {}) {
		this.#resourcesFactory = resources
		this.stepMs = 1000 / fps
		this.maxStepsPerFrame = maxStepsPerFrame
		this.maxDeltaMs = maxDeltaMs
	}

	get running() {
		return this.#frameId !== null
	}

	/** Resolves the resources, creating them on first call only */
	get resources(): Promise<R> {
		this.#resources ??= Promise.resolve(this.#resourcesFactory()).then((resources) => {
			this.#loadedResources = resources
			return resources
		})
		return this.#resources
	}

	onFixedUpdate(callback: FixedUpdateCallback<R>) {
		this.#fixedUpdates.add(callback)
		return this
	}

	onUpdate(callback: UpdateCallback<R>) {
		this.#updates.add(callback)
		return this
	}

	onRender(callback: RenderCallback<R>) {
		this.#renders.add(callback)
		return this
	}

	async start(fn: (r: R) => void) {
		fn(await this.resources)
		if (this.running) return this
		this.#previousTime = null
		this.#accumulator = 0
		this.#frameId = requestAnimationFrame(this.#tick)
		return this
	}

	stop() {
		if (this.#frameId !== null) cancelAnimationFrame(this.#frameId)
		this.#frameId = null
	}

	#tick = (now: number) => {
		this.#frameId = requestAnimationFrame(this.#tick)
		const resources = this.#loadedResources!

		const rawDelta = this.#previousTime === null ? 0 : now - this.#previousTime
		this.#previousTime = now
		const deltaMs = Math.min(rawDelta, this.maxDeltaMs) * this.timeScale

		this.#accumulator += deltaMs
		let steps = 0
		while (this.#accumulator >= this.stepMs && steps < this.maxStepsPerFrame) {
			for (const fixedUpdate of this.#fixedUpdates) fixedUpdate(resources, this.stepMs)
			this.fixedTime += this.stepMs
			this.#accumulator -= this.stepMs
			steps++
		}
		// Drop leftover time we couldn't catch up on rather than accumulating debt
		if (steps === this.maxStepsPerFrame) this.#accumulator %= this.stepMs

		this.time += deltaMs
		for (const update of this.#updates) update(resources, deltaMs)

		const alpha = this.#accumulator / this.stepMs
		for (const render of this.#renders) render(resources, alpha, deltaMs)
	}
}
