const ora = require('ora')
const rm = require('rimraf')
const path = require('path')
const chalk = require('chalk')
const webpack = require('webpack')
const merge = require('webpack-merge')
const program = require('commander')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const MpxWebpackPlugin = require('@mpxjs/webpack-plugin')
const mpxWebpackPluginConfig = require('./mpx.plugin.conf')

let webpackMainConfig = require('./webpack.conf')

var prodEnv = require('../config/prod.env')
var devEnv = require('../config/dev.env')

const mainSubDir = ''
function resolveDist (file, subPathStr = mainSubDir) {
  return path.resolve(__dirname, '../dist', subPathStr, file || '')
}
function resolve (dir) {
  return path.join(__dirname, '..', dir)
}

const webpackConfigArr = []
const userSelectedMode = 'wx'

const mpxLoaderConfig = {
  transRpx: 
   [
    {
      mode: 'only',
      comment: 'use rpx',
      include: resolve('src')
    },
    {
      // 对某些第三方组件库另设转换规则
      mode: 'wx',
      designWidth: 375,
      include: resolve('node_modules/vant-weapp')
    },
    {
      // 对某些第三方组件库另设转换规则
      mode: 'ali',
      designWidth: 375,
      include: resolve('node_modules/mini-ali-ui')
    },
    {
      mode: 'ali',
      designWidth: 375,
      include: resolve('node_modules/ivewali')
    }
   ]
}

const transModuleRules = [
  {
    test: /\.mpx$/,
    use: MpxWebpackPlugin.loader(mpxLoaderConfig)
  }
]


// 支持的平台，若后续@mpxjs/webpack-plugin支持了更多平台，补充在此即可
const supportedCrossMode = ['wx', 'ali', 'swan', 'qq', 'tt']
// 提供npm argv找到期望构建的平台，必须在上面支持的平台列表里
const npmConfigArgvOriginal = (process.env.npm_config_argv && JSON.parse(process.env.npm_config_argv).original) || []
const modeArr = npmConfigArgvOriginal.filter(item => typeof item === 'string').map(item => item.replace('--', '')).filter(item => supportedCrossMode.includes(item))

if (modeArr.length === 0) modeArr.push(userSelectedMode)

modeArr.forEach(item => {
  const webpackCrossConfig = merge(webpackMainConfig, {
    name: item + '-compiler',
    output: {
      path: resolveDist('', item)
    },
    module: { rules: transModuleRules },
    plugins: [
      new MpxWebpackPlugin(Object.assign({
        mode: item,
        srcMode: userSelectedMode
      }, mpxWebpackPluginConfig)),
      new CopyWebpackPlugin([
        {
          from: `static/${item}/**.*`,
          to: `../../dist/${item}/[name].[ext]`
        }
      ])
    ]
  })
  webpackConfigArr.push(webpackCrossConfig)
})

program
  .option('-w, --watch', 'watch mode')
  .option('-p, --production', 'production release')
  .parse(process.argv)

function runWebpack (cfg) {
  // env
  if (Array.isArray(cfg)) {
    cfg.forEach(item => item.plugins.unshift(new webpack.DefinePlugin(program.production ? prodEnv : devEnv)))
  } else {
    cfg.plugins.unshift(new webpack.DefinePlugin(program.production ? prodEnv : devEnv))
  }

  // production mode set mode be 'production' for webpack
  // watch mode set cache be true for webpack
  if (program.production || program.watch) {
    const extendCfg = {}
    if (program.production) { extendCfg.mode = 'production' }
    if (program.watch){ extendCfg.cache = true }

    if (Array.isArray(cfg)) {
      cfg = cfg.map(item => merge(item, extendCfg))
    } else {
      cfg = merge(cfg, extendCfg)
    }
  }
  if (process.env.npm_config_report) {
    var BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
    var mainCfg = Array.isArray(cfg) ? cfg[0] : cfg
    mainCfg.plugins.push(new BundleAnalyzerPlugin())
  }
  if (program.watch) {
    webpack(cfg).watch({}, callback)
  } else {
    webpack(cfg, callback)
  }
}

function callback (err, stats) {
  spinner.stop()
  if (err) return console.error(err)
  if (Array.isArray(stats.stats)) {
    stats.stats.forEach(item => {
      console.log(item.compilation.name + '打包结果：')
      process.stdout.write(item.toString({
        colors: true,
        modules: false,
        children: false,
        chunks: false,
        chunkModules: false,
        entrypoints: false
      }) + '\n\n')
    })
  } else {
    process.stdout.write(stats.toString({
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false,
      entrypoints: false
    }) + '\n\n')
  }

  if (!program.watch && stats.hasErrors()) {
    console.log(chalk.red('  Build failed with errors.\n'))
    process.exit(1)
  }

  console.log(chalk.cyan('  Build complete.\n'))
  if (program.watch) {
    console.log(chalk.cyan(`  ${new Date()} build finished.\n  Still watching...\n`))
  }
}

var spinner = ora('building...')
spinner.start()

try {
  modeArr.forEach(item => {
    rm.sync(path.resolve(__dirname, `../dist/${item}/*`))
  })
} catch (e) {
  console.error(e)
  console.log('\n\n删除dist文件夹遇到了一些问题，如果遇到问题请手工删除dist重来\n\n')
}

if (webpackConfigArr.length === 1) {
  runWebpack(webpackConfigArr[0])
} else {
  runWebpack(webpackConfigArr)
}
