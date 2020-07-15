import webpack, {Compiler} from 'webpack'
import Compilation = webpack.compilation.Compilation
import ChunkGroup = webpack.compilation.ChunkGroup

const isOriginDynamicImported = (origin: string, chunkGroup: ChunkGroup) => {
	// check if origin is imported via import()
	for (const chunk of chunkGroup.chunks)
		for (const module of chunk.getModules())
			for (const {type, userRequest} of module.reasons)
				if (userRequest === origin && type === 'import()') return true
	return false
}

export interface LoadableManifest {
	publicPath?: string
	originToChunkGroups: Record<string, string[]>
	chunkGroupAssets: Record<string, string[]>
	preloadAssets: Record<string, string[]>
	prefetchAssets: Record<string, string[]>
}
const assetFilter = (includeHotUpdate?: boolean, includeSourceMap?: boolean) => (
	file: string
) => (includeHotUpdate || !/\.hot-update\.js$/.test(file))
	&& (file.endsWith('.js') || file.endsWith('.css') || (includeSourceMap && file.endsWith('.map')))
const buildManifest = (compilation: Compilation, includeHotUpdate?: boolean, includeSourceMaps?: boolean) => {
	const filterCb = assetFilter(includeHotUpdate, includeSourceMaps)
	const includedChunkGroups = new Set<string>()
	// get map of origin to chunk groups
	const originToChunkGroups: Record<string, string[]> = {}
	for (const chunkGroup of compilation.chunkGroups)
		for (const origin of chunkGroup.origins)
			if (isOriginDynamicImported(origin, chunkGroup)) {
				includedChunkGroups.add(chunkGroup.name)
				if (!originToChunkGroups[origin]) originToChunkGroups[origin] = []
				originToChunkGroups[origin].push(chunkGroup.name)
			}

	const {namedChunkGroups} = compilation.getStats().toJson({
		all: false,
		chunkGroups: true
	})
	const chunkGroupAssets: Record<string, string[]> = {}
	const preloadAssets: Record<string, string[]> = {}
	const prefetchAssets: Record<string, string[]> = {}
	const chunkGroupSizes: Record<string, number> = {}
	for (const chunkGroup of compilation.chunkGroups)
		if (includedChunkGroups.has(chunkGroup.name)) {
			//get map of chunk group to assets
			chunkGroupAssets[chunkGroup.name] = chunkGroup.getAllFiles().filter(filterCb)

			//get chunk group size
			let size = 0
			for (const md of chunkGroup.getModules())
				if (filterCb(md.userRequest)) size += md.size()
			chunkGroupSizes[chunkGroup.name] = size

			//child assets
			const {prefetch, preload} = namedChunkGroups![chunkGroup.name].childAssets
			preloadAssets[chunkGroup.name] = preload?.filter(filterCb) || []
			prefetchAssets[chunkGroup.name] = prefetch?.filter(filterCb) || []
		}

	//sort for the greedy cover set algorithm
	for (const chunkGroups of Object.values(originToChunkGroups))
		chunkGroups.sort(
			(cg1, cg2) => chunkGroupSizes[cg1] - chunkGroupSizes[cg2]
		)
	return {
		publicPath: compilation.outputOptions.publicPath,
		originToChunkGroups,
		chunkGroupAssets,
		preloadAssets,
		prefetchAssets,
	}
}


export class ReactLoadablePlugin {
	constructor(private options: {
		filename: string
		includeHotUpdate?: boolean
		includeSourceMap?: boolean
	}) {}

	apply(compiler: Compiler) {
		const emit = (compilation: Compilation, callback?: () => any) => {
			const manifest = buildManifest(compilation, this.options.includeHotUpdate, this.options.includeSourceMap)
			const json = JSON.stringify(manifest, null, 2)
			compilation.assets[this.options.filename] = {
				source() { return json },
				size() { return json.length }
			}
			callback?.()
		}
		if (compiler.hooks) compiler.hooks.emit.tap('react-loadable', emit)
		else compiler.plugin('emit', emit)
	}
}

export const getBundles = (
	{
		publicPath: defaultPublicPath,
		originToChunkGroups,
		chunkGroupAssets,
		preloadAssets,
		prefetchAssets,
	}: LoadableManifest,
	moduleIds: string[],
	{entries, publicPath}: {
		publicPath?: string
		entries?: string[]
	} = {}
) => {
	if (!entries) entries = ['main']
	if (publicPath === undefined) publicPath = defaultPublicPath || ''

	const chunkGroups = new Set<string>()
	const assets = new Set<string>()
	const preload = new Set<string>()
	const prefetch = new Set<string>()

	const addChunkGroup = (chunkGroup: string) => {
		if (chunkGroups.has(chunkGroup)) return
		chunkGroups.add(chunkGroup)
		if (!chunkGroupAssets[chunkGroup]) {
			console.warn(`Can not find chunk group ${chunkGroup}`)
			return
		}
		for (const asset of chunkGroupAssets[chunkGroup]) assets.add(asset)
		for (const asset of preloadAssets[chunkGroup]) preload.add(asset)
		for (const asset of prefetchAssets[chunkGroup]) prefetch.add(asset)
	}

	for (const entry of entries) addChunkGroup(entry)
	for (const moduleId of moduleIds) {
		const includingChunkGroups = originToChunkGroups[moduleId]
		if (!includingChunkGroups) {
			console.warn(`Can not determine chunk group for module id ${moduleId}`)
			continue
		}
		if (includingChunkGroups.some(chunkGroup => chunkGroups.has(chunkGroup)))
			continue
		addChunkGroup(includingChunkGroups[0])
	}
	return {assets, preload, prefetch}
}
