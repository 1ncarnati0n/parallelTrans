const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Load .env file
dotenv.config();

module.exports = {
  mode: 'production',
  devtool: 'source-map',

  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup.ts',
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  },

  resolve: {
    extensions: ['.ts', '.js', '.css']
  },

  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup.html', to: 'popup.html' },
        { from: 'src/content.css', to: 'content.css' }
      ]
    }),
    new webpack.DefinePlugin({
      'process.env': {
        'DEEPL_API_KEY': JSON.stringify(process.env.DEEPL_API_KEY || ''),
        'AZURE_TRANSLATION_KEY': JSON.stringify(process.env.AZURE_TRANSLATION_KEY || '')
      }
    })
  ],

  optimization: {
    minimize: true
  }
};
