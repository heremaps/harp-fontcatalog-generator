#!/usr/bin/env node
/**
  * Copyright (C) 2018-2019 HERE Europe B.V.
  * Licensed under Apache 2.0, see full license in LICENSE
  * SPDX-License-Identifier: Apache-2.0
  */
/**
 * Script designed to generate the TextCanvas' FontCatalog assets.
 * Usage: harp-fontcatalog-generator -- -i <inputFile> -o <outputDir>
 */

// tslint:disable
const minimist = require("minimist");
const fs = require("fs");
const path = require("path");
const mkpath = require("mkpath");
const fontkit = require("fontkit");
const unicodeBlocks = require("unicode-range-json");
const generateBMFont = require("msdf-bmfont-xml");
// tslint:enable

// tslint:disable:no-console

interface UnicodeBlock {
    name: string;
    min: number;
    max: number;
    fonts: string[];
}

interface Font {
    name: string;
    metrics: {
        size: number;
        distanceRange: number;
        base: number;
        lineHeight: number;
        lineGap: number;
        capHeight: number;
        xHeight: number;
    };
    charset: string;
    bold?: string;
    italic?: string;
    boldItalic?: string;
}

interface FontCatalog {
    name: string;
    type: string;
    size: number;
    maxWidth: number;
    maxHeight: number;
    distanceRange: number;
    fonts: Font[];
    supportedBlocks: UnicodeBlock[];
}

// Output JSON.
const fontCatalog: FontCatalog = {
    name: "",
    type: "",
    size: 0.0,
    maxWidth: 0.0,
    maxHeight: 0.0,
    distanceRange: 0.0,
    fonts: [],
    supportedBlocks: []
};

// SDF Texture Generation options.
const sdfOptions = {
    outputType: "json",
    filename: "",
    charset: "",
    fontSize: 0.0,
    texturePadding: 2.0,
    fieldType: "",
    distanceRange: 0.0,
    smartSize: true
};

// All Unicode Block names available in "unicode-range-json".
const unicodeBlockNames: string[] = [];
for (const unicodeBlock of unicodeBlocks) {
    unicodeBlockNames.push(unicodeBlock.category);
}

async function createReplacementAssets(outputPath: string): Promise<void> {
    const fontPath = path.resolve(__dirname, `../resources-dev/fonts/NotoSans-Regular.ttf`);
    const fontInfo = fontkit.openSync(fontPath);
    const fontObject = {
        name: "Extra",
        metrics: {
            size: sdfOptions.fontSize,
            distanceRange: sdfOptions.distanceRange,
            base: 0.0,
            lineHeight: 0.0,
            lineGap: Math.round((fontInfo.lineGap / fontInfo.unitsPerEm) * sdfOptions.fontSize),
            capHeight: Math.round((fontInfo.capHeight / fontInfo.unitsPerEm) * sdfOptions.fontSize),
            xHeight: Math.round((fontInfo.xHeight / fontInfo.unitsPerEm) * sdfOptions.fontSize)
        },
        charset: ""
    };

    await new Promise((resolve, reject) => {
        const assetsDir = path.resolve(outputPath, `${fontCatalog.name}_Assets/`);
        sdfOptions.filename = "Specials";

        const supportedCharset = "�";
        fontObject.charset += supportedCharset;
        sdfOptions.charset = supportedCharset;

        generateBMFont(fontPath, sdfOptions, (error: any, textures: any, rawJson: any) => {
            if (error) {
                reject(error);
                return;
            }

            // Make sure the destination path exists.
            mkpath.sync(assetsDir + "/Extra");

            // Save all the texture pages.
            textures.forEach((texture: any, index: number) => {
                fs.writeFileSync(`${assetsDir}/Extra/${texture.filename}.png`, texture.texture);
            });

            // Store the font size, lineHeight and baseline.
            const json = JSON.parse(rawJson.data);
            fontObject.metrics.lineHeight = json.common.lineHeight;
            fontObject.metrics.base = json.common.base;

            // Store the max entry size width/height.
            for (const char of json.chars) {
                fontCatalog.maxWidth = Math.max(fontCatalog.maxWidth, char.width);
                fontCatalog.maxHeight = Math.max(fontCatalog.maxHeight, char.height);
            }

            // Save the generated json.
            fs.writeFileSync(`${assetsDir}/Extra/Specials.json`, rawJson.data);
            resolve();
        });
    });

    // If suceeded, register this block in the fontCatalog.
    const blockEntry = fontCatalog.supportedBlocks.find((element: any) => {
        return element.name === "Specials";
    });
    if (blockEntry === undefined) {
        fontCatalog.supportedBlocks.push({
            name: "Specials",
            min: 65520,
            max: 65535,
            fonts: ["Extra"]
        });
    } else {
        blockEntry.fonts.push("Extra");
    }

    fontCatalog.fonts.push(fontObject);
}

async function createBlockAssets(
    font: any,
    fontObject: Font,
    fontPath: string,
    unicodeBlock: any,
    info: any,
    bold: boolean,
    italic: boolean,
    outputPath: string
): Promise<void> {
    await new Promise((resolve, reject) => {
        const assetSuffix =
            bold === true
                ? italic === true
                    ? "_BoldItalicAssets/"
                    : "_BoldAssets/"
                : italic === true
                ? "_ItalicAssets/"
                : "_Assets/";
        const assetsDir = path.resolve(outputPath, `${fontCatalog.name}${assetSuffix}`);
        sdfOptions.filename = unicodeBlock.category.replace(/ /g, "_");

        // Make sure that, for each unicode block, we store only the characters supported by the
        // font.
        let supportedCharset = "";
        for (const codePoint of info.characterSet) {
            if (codePoint >= unicodeBlock.range[0] && codePoint <= unicodeBlock.range[1]) {
                supportedCharset += String.fromCodePoint(codePoint);
            }
        }
        fontObject.charset += supportedCharset;
        sdfOptions.charset = supportedCharset;

        if (sdfOptions.charset === "") {
            reject(
                `No characters in "${unicodeBlock.category}" are supported by font "${font.name}".`
            );
        } else {
            const assetType =
                bold === true
                    ? italic === true
                        ? "BOLD ITALIC"
                        : "BOLD"
                    : italic === true
                    ? "ITALIC"
                    : "REGULAR";
            const blockSupport =
                supportedCharset.length / (unicodeBlock.range[1] - unicodeBlock.range[0] + 1);

            console.log(`INFO: Generating ${assetType} assets for block: ${unicodeBlock.category}`);
            console.log(
                `INFO: Code point support ${(blockSupport * 100).toFixed(3)}% (${
                    supportedCharset.length
                }/${unicodeBlock.range[1] - unicodeBlock.range[0] + 1})`
            );

            generateBMFont(fontPath, sdfOptions, (error: any, textures: any, rawJson: any) => {
                if (error) {
                    reject(error);
                    return;
                }

                // Make sure the destination path exists.
                mkpath.sync(assetsDir + "/" + font.name);

                // Save all the texture pages.
                textures.forEach((texture: any, index: number) => {
                    fs.writeFileSync(
                        `${assetsDir}/${font.name}/${texture.filename}.png`,
                        texture.texture
                    );
                });

                // Store the font size, lineHeight and baseline.
                const json = JSON.parse(rawJson.data);
                fontObject.metrics.lineHeight = json.common.lineHeight;
                fontObject.metrics.base = json.common.base;

                // Store the max entry size width/height.
                for (const char of json.chars) {
                    fontCatalog.maxWidth = Math.max(fontCatalog.maxWidth, char.width);
                    fontCatalog.maxHeight = Math.max(fontCatalog.maxHeight, char.height);
                }

                // Save the generated json.
                fs.writeFileSync(
                    `${assetsDir}/${font.name}/${unicodeBlock.category.replace(/ /g, "_")}.json`,
                    rawJson.data
                );
                resolve();
            });
        }
    });
}

async function createFontAssets(
    font: any,
    fontObject: Font,
    fontPath: string,
    info: any,
    bold: boolean,
    italic: boolean,
    outputPath: string
): Promise<void> {
    const fontVariant =
        bold === true
            ? italic === true
                ? font.boldItalic
                : font.bold
            : italic === true
            ? font.italic
            : font.name;
    console.log("INFO: Generating assets for font: " + fontVariant);

    // Generate an individual BMFont asset for each unicode block supported by this font.
    const fontUnicodeBlockNames =
        font.blocks !== undefined && font.blocks.length > 0 ? font.blocks : unicodeBlockNames;
    for (const blockName of fontUnicodeBlockNames) {
        // Check if we have a valid block.
        let selectedBlock = unicodeBlocks.find((element: any) => {
            return element.category === blockName;
        });
        if (selectedBlock === undefined) {
            console.warn(`WARN: "${blockName}" is not a valid Unicode Block.`);
            continue;
        }

        // Try generating assets for this block.
        try {
            await createBlockAssets(
                font,
                fontObject,
                fontPath,
                selectedBlock,
                info,
                bold,
                italic,
                outputPath
            );
        } catch (e) {
            console.warn("WARN: " + e);
            continue;
        }

        // If succeeded, register this block in the fontCatalog.
        const blockEntry = fontCatalog.supportedBlocks.find((element: any) => {
            return element.name === blockName;
        });
        if (blockEntry === undefined) {
            fontCatalog.supportedBlocks.push({
                name: blockName,
                min: selectedBlock.range[0],
                max: selectedBlock.range[1],
                fonts: [font.name]
            });
        } else if (bold === false && italic === false) {
            blockEntry.fonts.push(font.name);
        }
    }
}

async function main() {
    const args = minimist(process.argv.slice(2));

    // Process input an output.
    let inputPath: string;
    if (args.i === undefined) {
        console.error(`ERROR: No FontCatalog description JSON file was provided (-i).`);
        return;
    } else {
        inputPath = path.resolve(process.cwd(), args.i);
    }
    let outputPath: string = path.resolve(process.cwd(), "./output/");
    if (args.o === undefined) {
        console.warn(`WARN: No output path provided. Using default "output" folder (-o).\n`);
    } else {
        outputPath = path.resolve(process.cwd(), args.o);
    }

    // Read the FontCatalog description JSON file.
    const fontCatalogDescription = JSON.parse(
        fs.readFileSync(inputPath, {
            encoding: "utf8"
        })
    );
    let fontsDir;
    try {
        fontsDir = path.resolve(inputPath, fontCatalogDescription.fontsDir);
    } catch (e) {
        console.error(`ERROR: Invalid "fontsDir" relative path found in ${inputPath}.`);
        return;
    }
    fontCatalog.name =
        fontCatalogDescription.name !== undefined ? fontCatalogDescription.name : "Default";
    fontCatalog.size =
        fontCatalogDescription.size !== undefined ? fontCatalogDescription.size : 32.0;
    fontCatalog.type = fontCatalogDescription.type === "msdf" ? "msdf" : "sdf";
    fontCatalog.distanceRange =
        fontCatalogDescription.distance !== undefined ? fontCatalogDescription.distance : 8.0;
    sdfOptions.fontSize = fontCatalog.size;
    sdfOptions.fieldType = fontCatalog.type;
    sdfOptions.distanceRange = fontCatalog.distanceRange;

    // Output generation info.
    console.log(`INFO: === FontCatalog Generation ===`);
    console.log(`INFO: Input: ${inputPath}`);
    console.log(`INFO: Output: ${outputPath}`);
    console.log(`INFO: Name: ${fontCatalog.name}`);
    console.log(`INFO: Size: ${fontCatalog.size}`);
    console.log(`INFO: Distance: ${fontCatalog.distanceRange}`);
    console.log(`INFO: Type: ${fontCatalog.type}\n`);

    // Generate the BMFont assets for all fonts.
    for (const font of fontCatalogDescription.fonts) {
        const fontPath = `${fontsDir}/${font.name}.ttf`;
        const fontInfo = fontkit.openSync(fontPath);
        const fontObject: Font = {
            name: font.name,
            metrics: {
                size: sdfOptions.fontSize,
                distanceRange: sdfOptions.distanceRange,
                base: 0.0,
                lineHeight: 0.0,
                lineGap: Math.round((fontInfo.lineGap / fontInfo.unitsPerEm) * sdfOptions.fontSize),
                capHeight: Math.round(
                    (fontInfo.capHeight / fontInfo.unitsPerEm) * sdfOptions.fontSize
                ),
                xHeight: Math.round((fontInfo.xHeight / fontInfo.unitsPerEm) * sdfOptions.fontSize)
            },
            charset: ""
        };
        await createFontAssets(font, fontObject, fontPath, fontInfo, false, false, outputPath);

        // Check if we need to also create assets for the different font style variants.
        if (font.bold !== undefined) {
            const boldFontPath = `${fontsDir}/${font.bold}.ttf`;
            const boldFontInfo = fontkit.openSync(boldFontPath);
            fontObject.bold = font.bold;
            await createFontAssets(
                font,
                fontObject,
                boldFontPath,
                boldFontInfo,
                true,
                false,
                outputPath
            );
        }
        if (font.italic !== undefined) {
            const italicFontPath = `${fontsDir}/${font.italic}.ttf`;
            const italicFontInfo = fontkit.openSync(italicFontPath);
            fontObject.italic = font.italic;
            await createFontAssets(
                font,
                fontObject,
                italicFontPath,
                italicFontInfo,
                false,
                true,
                outputPath
            );
        }
        if (font.boldItalic !== undefined) {
            const boldItalicFontPath = `${fontsDir}/${font.boldItalic}.ttf`;
            const boldItalicFontInfo = fontkit.openSync(boldItalicFontPath);
            fontObject.boldItalic = font.boldItalic;
            await createFontAssets(
                font,
                fontObject,
                boldItalicFontPath,
                boldItalicFontInfo,
                true,
                true,
                outputPath
            );
        }
        fontCatalog.fonts.push(fontObject);
    }

    // Generate BMFont assets for the replacement character.
    await createReplacementAssets(outputPath);

    // Wrote the font catalog to a file.
    const fontCatalogData = JSON.stringify(fontCatalog);
    fs.writeFileSync(
        path.resolve(outputPath, `${fontCatalog.name}_FontCatalog.json`),
        fontCatalogData
    );
}

main();