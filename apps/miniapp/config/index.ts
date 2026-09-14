import path from 'node:path'
import { defineConfig } from '@tarojs/cli'
import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig(async (merge) => {
  const isH5 = process.env.TARO_ENV === 'h5'
  const baseConfig = {
    projectName: 'store-manager-miniapp',
    date: '2026-9-12',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2,
      375: 2,
    },
    sourceRoot: 'src',
    outputRoot: isH5 ? 'dist-h5' : 'dist',
    plugins: ['@tarojs/plugin-framework-react'],
    defineConstants: {
      'process.env.TARO_APP_API': JSON.stringify(process.env.TARO_APP_API || ''),
    },
    copy: {
      patterns: isH5 ? [{ from: 'src/assets', to: 'dist-h5/assets' }] : [],
      options: {},
    },
    framework: 'react',
    compiler: { type: 'webpack5', prebundle: { enable: false } },
    cache: { enable: false },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        url: { enable: true, config: { limit: 1024 } },
        cssModules: {
          enable: false,
          config: { namingPattern: 'module', generateScopedName: '[name]__[local]___[hash:base64:5]' },
        },
      },
      webpackChain(chain: any) {
        chain.plugins.delete('webpackbar')
        chain.merge({ ignoreWarnings: [/webpackExports/] })
        chain.resolve.alias.set('@sm/shared', path.resolve(__dirname, '../../../packages/shared/src'))
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: { enable: false, config: { namingPattern: 'module' } },
      },
      webpackChain(chain: any) {
        chain.plugins.delete('webpackbar')
        chain.merge({ ignoreWarnings: [/webpackExports/], performance: { hints: false } })
      },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
