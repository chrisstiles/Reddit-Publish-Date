const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserWebpackPlugin = require('terser-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const openBrowser = require('react-dev-utils/openBrowser');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';
  const isProd = argv.mode === 'production';
  const minimize = true;

  return {
    entry: {
      client: './src/client/client.js',
      background: './src/background/background.js',
      options: './src/options/options.js'
    },
    output: {
      path: path.resolve(__dirname, 'dist')
    },
    resolve: {
      alias: {
        '@constants$': path.resolve(__dirname, 'src/utils/constants')
      }
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader'
          }
        },
        {
          test: /\.(css|scss)$/,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader']
        }
      ]
    },
    plugins: [
      isProd && new CleanWebpackPlugin(),
      new CopyWebpackPlugin({
        patterns: [
          'manifest.json',
          {
            from: 'src/icons',
            to: 'icons'
          }
        ]
      }),
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/
      }),
      new MiniCssExtractPlugin(),
      new HtmlWebpackPlugin({
        template: path.join(__dirname, 'src/options/options.html'),
        filename: 'options.html',
        publicPath: '',
        chunks: ['options'],
        cache: false
      }),
      new webpack.ProvidePlugin({
        process: 'process/browser'
      })
    ].filter(Boolean),
    devtool: false,
    optimization: {
      minimize: true,
      usedExports: true,
      minimizer: [
        new TerserWebpackPlugin({
          extractComments: false,
          terserOptions: {
            mangle: minimize,
            compress: minimize
          }
        })
      ]
    },
    devServer: {
      hot: false,
      port: 5555,
      client: {
        logging: 'error'
      },
      devMiddleware: {
        writeToDisk: true
      },
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      allowedHosts: 'all',
      onListening() {
        if (isDev) {
          const protocol = this.server.type || 'https';
          const host = this.host || 'localhost';
          openBrowser(`${protocol}://${host}:${this.port}/options.html`);
        }
      }
    }
  };
};
