import express from 'express'
import path from 'path'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import Loadable from 'react-loadable'
import {getBundles} from 'react-loadable-webpack'
import App from './components/App'
import fs from 'fs'

const stats = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'dist/react-loadable.json'), 'utf8'));
const app = express();

const Html = ({styles, scripts, children}) => {
  return <html lang="en">
    <head>
      <meta charSet="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta httpEquiv="X-UA-Compatible" content="ie=edge"/>
      <title>My App</title>
      {
        styles.map(style => {
          return <link href={`/dist/${style.file}`} rel="stylesheet"/>;
        })
      }
    </head>
    <body>
    <div id="app">{children}</div>
    <script src="/dist/main.js"/>
    {
      scripts.map(script => {
        return <script src={`/dist/${script.file}`}/>
      })
    }
    <script>window.main();</script>
    </body>
  </html>
}

app.get('/', (req, res) => {
  let modules = [];
  let body = ReactDOMServer.renderToString(
    <Loadable.Capture report={moduleName => modules.push(moduleName)}>
      <App/>
    </Loadable.Capture>
  );

  let bundles = getBundles(stats, modules);

  let styles = bundles.filter(bundle => bundle.file.endsWith('.css'));
  let scripts = bundles.filter(bundle => bundle.file.endsWith('.js'));

  res.send(`<!doctype html>
${ReactDOMServer.renderToStaticMarkup(<Html styles={styles} scripts={scripts}>
    {body}
  </Html>)}`)
});

app.use('/dist', express.static(path.join(__dirname, 'dist')));

Loadable.preloadAll().then(() => {
  app.listen(3000, () => {
    console.log('Running on http://localhost:3000/');
  });
}).catch(err => {
  console.log(err);
});
