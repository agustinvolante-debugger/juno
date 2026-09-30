// The film's scene lives in the website (../app/pen/film). One React for both: the scene's JSX
// would otherwise pick up the site's copy from ../node_modules. Run from video/ (npm scripts do).
import path from 'node:path'
import { Config } from '@remotion/cli/config'

Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      react: path.resolve(process.cwd(), 'node_modules/react'),
      'react-dom': path.resolve(process.cwd(), 'node_modules/react-dom'),
    },
  },
}))
Config.setVideoImageFormat('jpeg')
Config.setCodec('h264')
