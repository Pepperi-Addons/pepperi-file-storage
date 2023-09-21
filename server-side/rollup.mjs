import { rollup } from 'rollup';
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import config from '../addon.config.json' assert { type: "json" };
import json from '@rollup/plugin-json'


async function sequentialRollup()
{
    for (const endpoint of config.Endpoints) {
        console.log(`Rollup for ${endpoint}...`);
        let bundle = await rollup({
            input: endpoint,
            output: [
                {
                    dir: '../publish/',
                    format: 'cjs'
                }
            ],
            external: ["aws-sdk"],
            plugins: [
                typescript({
                    tsconfigOverride: {
                        compilerOptions: {
                            module: "es2015",
                            declaration: false
                        }
                    }
                }),
                resolve(),
                commonjs({
                    ignore: ["aws-sdk"]
                }),
                json()
            ],
        });

        console.log(`Writing ${endpoint}...`);


        await bundle.write({
            dir: '../publish/',
            format: 'cjs',
        });

        bundle.close();

        console.log(`Done ${endpoint}.`);
    }
}

await sequentialRollup();