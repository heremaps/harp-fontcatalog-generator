#!/usr/bin/env node
/**
 * Copyright (C) 2018-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Script designed to generate a JSON file containing all existing unicode ranges (blocks).
 */

namespace UnicodeRangesScript {
    // tslint:disable
    const fs = require("fs");
    const https = require("https");
    const path = require("path");
    // tslint:enable

    interface UnicodeBlock {
        category: string;
        hexrange: string[];
        range: number[];
    }

    const unicodeBlockRegex = new RegExp(/\n([\dA-F]{4,6})\.\.([\dA-F]{4,6}); (.*)/, "g");

    const result: UnicodeBlock[] = [];

    export async function main() {
        let unicodeBlocksFile = "";
        https
            .get("https://unicode.org/Public/UNIDATA/Blocks.txt", (resp: any) => {
                resp.on("data", (chunk: any) => {
                    unicodeBlocksFile += chunk;
                });
                resp.on("end", () => {
                    let unicodeBlock;
                    while ((unicodeBlock = unicodeBlockRegex.exec(unicodeBlocksFile)) !== null) {
                        const block = {
                            category: unicodeBlock[3],
                            hexrange: [unicodeBlock[1], unicodeBlock[2]],
                            range: [Number("0x" + unicodeBlock[1]), Number("0x" + unicodeBlock[2])]
                        };
                        result.push(block);
                    }
                    fs.writeFileSync(
                        path.resolve(
                            path.resolve(process.cwd(), "./resources/"),
                            `unicode-ranges.json`
                        ),
                        JSON.stringify(result)
                    );
                });
            })
            .on("error", (err: Error) => {
                console.log("Error: " + err.message);
            });
    }
}

UnicodeRangesScript.main();
