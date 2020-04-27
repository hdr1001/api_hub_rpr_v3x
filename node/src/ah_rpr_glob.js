// *********************************************************************
//
// API Hub request, persist & respond global variables
// JavaScript code file: ah_rpr_glob.js
//
// Copyright 2019 Hans de Rooij
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
// either express or implied. See the License for the specific
// language governing permissions and limitations under the
// License.
//
// *********************************************************************
'use strict';

//Structure of the data delivered
const dataStruct = ['XML', 'JSON'];

const idxDataStruct = {
   xml: 0,
   json: 1
};

//Supported APIs
const apis = [
   {id: 'dpl', struct: dataStruct[idxDataStruct.json]}, 
   {id: 'd2o', struct: dataStruct[idxDataStruct.json]},
   {id: 'dit', struct: dataStruct[idxDataStruct.xml]},
   {id: 'lei', struct: dataStruct[idxDataStruct.json]}
 ];
 
const idxApis = {
   apiDpl: 0, //D&B Direct+
   apiD2o: 1, //D&B Direct 2.0 Onboard
   apiDit: 2, //D&B Toolkit
   apiLei: 3  //GLEIF
};

//Provider hosting the API
const providers = ['dnb', 'gleif'];
 
const idxProviders = {
   dnb: 0,    //D&B (Dun & Bradstreet)
   gleif: 1   //GLEIF (Global Legal Entity Identifier Foundation)
};

//Identifying keys
const keys = ['duns', 'lei'];

const idxKeys = {
   duns: 0, //D&B (i.e. DUNS)
   lei: 1, //GLEIF Legal Entity Identifier
};
 
//Supported products
const products = [
   {  prodID: 'cmpelk',
      api: apis[idxApis.apiDpl],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['v1', 'v2']
   },

   {  prodID: 'cmptcs',
      api: apis[idxApis.apiDpl],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['v1']
   },

   {  prodID: 'CMP_VRF_ID',
      api: apis[idxApis.apiD2o],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['V6.0']
   },

   {  prodID: 'CMP_BOS',
      api: apis[idxApis.apiD2o],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['V6.0']
   },

   {  prodID: 'gdp_em',
      prodName: 'Enterprise Management',
      api: apis[idxApis.apiDit],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['V4']
   },

   {  prodID: 'cmpcvf',
      api: apis[idxApis.apiDpl],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['v1']
   },

   {  prodID: 'cmpbos',
      api: apis[idxApis.apiDpl],
      provider: providers[idxProviders.dnb],
      key: keys[idxKeys.duns],
      versions: ['v1']
   },

   {  prodID: 'lei_ref',
      api: apis[idxApis.apiLei],
      provider: providers[idxProviders.gleif],
      key: keys[idxKeys.lei],
      versions: ['v2']
   }
];

const idxProducts = {
   cmpelk: 0,
   cmptcs: 1,
   cmpvrfid: 2,
   cmp_bos_d2o: 3,
   gdpem: 4,
   cmpcvf: 5,
   cmpbos: 6,
   lei_ref: 7
};

module.exports = Object.freeze({
   //Structure of the data delivered
   dataStruct,
   idxDataStruct,

   //Supported APIs
   apis,
   idxApis,

   //Providers of the APIs
   providers,
   idxProviders,

   //Supported data product keys
   keys,
   idxKeys,

   //Supported data products
   products,
   idxProducts
});
