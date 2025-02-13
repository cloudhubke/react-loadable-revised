import React from 'react'
import Loading from './Loading'
import loadable from '~react-loadable/revised'

const LoadableDescendant = loadable({
	loader: () => import(/*
		webpackChunkName: 'descendant',
		webpackPrefetch: true
	*/'./Descendant'),
	loading: Loading,
})
globalThis.nestedExampleLoaded = true
export default function ExampleNested() {
	return <>
		<h2>Hello from a nested loadable component!</h2>
		<LoadableDescendant/>
	</>
}
