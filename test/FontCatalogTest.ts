 /**
  * Copyright (C) 2018-2019 HERE Europe B.V.
  * Licensed under Apache 2.0, see full license in LICENSE
  * SPDX-License-Identifier: Apache-2.0
  */
 import { assert } from "chai";

 // tslint:disable
 const fs = require("fs");
 const path = require("path");
 // tslint:enable
 
 describe("FontCatalog", function() {
     it("Creation", function() {
         const fontCatalogPath = path.resolve(__dirname, "./resources/Test_FontCatalog.json");
         assert.isTrue(fs.existsSync(fontCatalogPath));
     });
 });
 