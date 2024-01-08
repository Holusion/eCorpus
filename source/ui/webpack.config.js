/**
 * 3D Foundation Project
 * Copyright 2019 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

////////////////////////////////////////////////////////////////////////////////
//
// Environment variables used
//
// NODE_ENV               development | production
// VOYAGER_OFFLINE        True for an offline build (no external dependencies)
// VOYAGER_ANALYTICS_ID   Google Analytics ID
//
////////////////////////////////////////////////////////////////////////////////
"use strict";

const path = require("path");

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");

////////////////////////////////////////////////////////////////////////////////

const project = path.resolve(__dirname, "../..");
const dirs = {
    project,
    source: path.resolve(project, "source/ui"),
    output: path.resolve(project, "dist"),
    modules: path.resolve( project, "source/ui/node_modules"),
    assets: path.resolve( project, "source/ui/assets"),
};

const createVoyagerConfig = require(path.join(project, "source/voyager/source/client/webpack.config.js"));


////////////////////////////////////////////////////////////////////////////////

module.exports = function createAppConfig(env, argv={})
{
    const isDevMode = (typeof argv?.mode !== "undefined") ? argv.mode !== "production" : process.env["NODE_ENV"] !== "production";
    const devMode = isDevMode ? "development" : "production";
    
    const config = {
        mode: devMode,
        cache: {type: "filesystem"},
        entry: {
            "corpus": "source/MainView.ts",
        },

        output: {
            path: dirs.output,
            filename: "js/[name].js",
            
            publicPath: '/',
            clean: false,
        },

        resolve: {
            modules: [
                dirs.modules,
            ],
            alias: {
                "source": dirs.source,
            },
            // Resolvable extensions
            extensions: [".ts", ".tsx", ".js", ".json"],
        },

        optimization: {
            //concatenateModules: false,
            minimize: !isDevMode,
            emitOnErrors: !isDevMode, //Should be disabled when possible
        },

        plugins: [
            new MiniCssExtractPlugin({
                filename: "css/[name].css",
                //allChunks: true
            }),
            new CopyPlugin({
                patterns: [
                    {
                        from: "images/**/*.{svg,png}",
                        context: path.join(project, "source/ui/assets/"),
                        priority: 0,
                    },
                    { 
                        from: "{js,js/draco,css,language,images}/*.{js,json,wasm,css,jpg,png,svg}",
                        context: path.join(project, "source/voyager/assets/"),
                        force: false,
                        priority: 1,
                    },
                ],
            }),
        ],

        // loaders execute transforms on a per-file basis
        module: {
            rules: [
                {
                    // Enforce source maps for all javascript files
                    enforce: "pre",
                    test: /\.js$/,
                    loader: "source-map-loader"
                },
                {
                    // Transpile SCSS to CSS and concatenate
                    test: /\.scss$/,
                    use:[         
                        MiniCssExtractPlugin.loader,
                        "css-loader",
                        "sass-loader"
                    ],
                },
                {
                    // Concatenate CSS
                    test: /\.css$/,
                    use: [
                        MiniCssExtractPlugin.loader,
                        //"style-loader",
                        "css-loader",
                    ]
                },
                {
                    // Typescript/JSX files
                    test: /\.tsx?$/,
                    use: "ts-loader",
		            exclude: /node_modules/,
                },
                {
                    test: /\.hbs$/,
                    loader: "handlebars-loader"
                },
                {
                    test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
                    type: 'asset/resource',
                    generator: {
                        filename: "images/[name][ext]",
                        publicPath: "/dist/",
                    }
                },
            ]
        },

        stats: {chunkModules: true, excludeModules: false }
    };

    if (isDevMode) {
        config.devtool = "source-map";
    }

    const voyagerConfig = createVoyagerConfig({app: "all"}, argv);
    /********************************
     * Override voyagerConfig's options
     ********************************/

    //Always use the same file name
    Object.assign(voyagerConfig.output, {
        clean: false,
        filename: "js/[name].js",
    });

    //Remove HTML exports
    voyagerConfig.plugins = voyagerConfig.plugins.filter(p=>p.constructor?.name !="HtmlWebpackPlugin");
    //Remove Copy Plugin
    voyagerConfig.plugins = voyagerConfig.plugins.filter(p=>p.constructor?.name !="CopyPlugin");

    const cssPlugin = voyagerConfig.plugins.find(p=>p.constructor?.name =="MiniCssExtractPlugin");
    if(!cssPlugin) throw new Error("MiniCssExtractPlugin not found in voyagerConfig.plugins");
    Object.assign(cssPlugin.options, {
        filename: "css/[name].css",
        chunkFilename: "css/[name].css",
    });

    return [config, voyagerConfig];
}
