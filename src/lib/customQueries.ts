import type { Query } from 'miniplex'

export interface AddedQuery<E> extends Iterable<E> {
	/** Number of entities added since the last drain */
	readonly size: number
	/** Stops tracking the source query */
	dispose: () => void
}

/**
 * Tracks entities that entered `query` since the last time it was iterated.
 * Iterating drains the tracked entities, so each entity is yielded once.
 * Entities removed from the query before being consumed are dropped.
 *
 * @example
 * const addedCharacters = added(ecs.with('character'))
 * loop.onUpdate(() => {
 *   for (const entity of addedCharacters) { ... }
 * })
 */
export function added<E>(query: Query<E>, { includeExisting = true } = {}): AddedQuery<E> {
	const pending = new Set<E>()

	query.connect()
	if (includeExisting) {
		for (const entity of query) pending.add(entity)
	}

	const unsubscribeAdded = query.onEntityAdded.subscribe((entity) => pending.add(entity))
	const unsubscribeRemoved = query.onEntityRemoved.subscribe((entity) => pending.delete(entity))

	return {
		get size() {
			return pending.size
		},
		*[Symbol.iterator]() {
			// Snapshot so entities added while iterating are kept for the next drain
			const entities = [...pending]
			pending.clear()
			yield* entities
		},
		dispose() {
			unsubscribeAdded()
			unsubscribeRemoved()
			pending.clear()
		},
	}
}
