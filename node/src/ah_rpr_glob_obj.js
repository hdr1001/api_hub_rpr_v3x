// *********************************************************************
//
// API Hub request, persist and respond global object code
// JavaScript code file: ah_rpr_glob_obj.js
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

//Import API Hub modules
const ahGlob = require('./ah_rpr_glob.js'); //Project globals
const ahErr = require('./ah_rpr_err.js');   //Project error handling code

//This code defines event emitting classes so ...
const EvntEmit = require('events');

//HTTP libraries
const https = require('https');
const qryStr = require('querystring');

//Event in constructor workaround, more visit https://goo.gl/KO547I
const emitConstructorEvnt = (instanceThis, sEvnt, err) => {
   EvntEmit.call(instanceThis);
   setImmediate(() => {instanceThis.emit(sEvnt, err)});
};

//Postgresql initialization
//Setting parseInt8 enables storing and retrieving JS dates as BIGINTs
const pg = require('pg'); pg.defaults.parseInt8 = true;
const pgConnPool = new pg.Pool(require('./creds/pg.json'));

pgConnPool.on('error', function (err, client) {
   // See: https://github.com/brianc/node-postgres
   // if an error is encountered by a client while it sits idle in the pool
   // the pool itself will emit an error event with both the error and
   // the client which emitted the original error
   // this is a rare occurrence but can happen if there is a network partition
   // between your application and the database, the database restarts, etc.
   // and so you might want to handle it and at least log it out
   console.log('Idle client error', err.message);
});

//Prepared statements used by the API Hub objects 
const sqlPrepStmts = {
   insAuthToken: function() {
      let sSQL = 'INSERT INTO auth_tokens ';
      sSQL += '(api, token, expires_in, obtained_at) ';
      sSQL += 'VALUES ($1, $2, $3, $4) ';
      sSQL += 'RETURNING id;';
      //console.log('SQL insAuthToken -> ' + sSQL);

      return {
         name: this._api.id + 'InsAuthToken',
         text: sSQL,
         values: [this._api.id, this._token, this._expiresIn, this._obtainedAt]
      };
   },

   getAuthToken: function() {
      let sSQL = 'SELECT id, token, expires_in, obtained_at ';
      sSQL += 'FROM auth_tokens ';
      sSQL += 'WHERE api = $1 ';
      sSQL += 'ORDER BY id DESC LIMIT 1;';
      //console.log('SQL getAuthToken -> ' + sSQL);

      return {
         name: this._api.id + 'GetAuthToken',
         text: sSQL,
         values: [this._api.id]
      };
   },

   insDataProduct: function() {
      let sSQL = 'INSERT INTO products_' + this._product.provider + ' ';
      sSQL += '(' + this._product.key + ', ' + this._product.prodID + ', ' + this._product.prodID + '_obtained_at) ';
      sSQL += 'VALUES ($1, $2, $3) ';
      sSQL += 'ON CONFLICT (' + this._product.key + ') DO UPDATE SET ';
      sSQL += this._product.prodID + ' = $2, ';
      sSQL += this._product.prodID + '_obtained_at = $3';;
      //console.log('SQL insDataProduct -> ' + sSQL);

      return {
         name: 'ins_' + this._product.prodID,
         text: sSQL,
         values: [this._sKey, this._rawRsltProduct, this._obtainedAt]
      };
   },
              
   getDataProduct: function() {
      let sSQL = 'SELECT ' + this._product.key + ', ' + this._product.prodID + ' AS product, ';
      sSQL += this._product.prodID + '_obtained_at AS poa FROM products_' + this._product.provider + ' ';
      sSQL += 'WHERE ' + this._product.key + ' = $1;';
      //console.log('SQL getDataProduct -> ' + sSQL);

      return {
         name: 'get_' + this._product.prodID,
         text: sSQL,
         values: [this._sKey]
      };
   }
};

//API parameters for HTTP transaction
const apiParams = {
   [ahGlob.apis[ahGlob.idxApis.apiDpl].id]: { //D&B Direct+
      authToken: {
         getHttpAttr: function() {
            const ret = {
               host: 'plus.dnb.com',
               path: '/v2/token',
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json',
                  Origin: 'www.dnb.com',
                  Authorization: 'Basic '
               }
            };

            let dpl_credentials = require('./creds/dpl.json');
            let buff = Buffer.from(dpl_credentials.usrID + ':' + dpl_credentials.pwd);
            let b64 = buff.toString('Base64');
            ret.headers.Authorization += b64;

            return ret;
         },

         getHttpPostBody: function() {
            return '{ "grant_type" : "client_credentials" }';
         }
      },
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'plus.dnb.com',
               path: '/v1/data/duns',
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json',
                  Origin: 'www.dnb.com'
               }
            };

            const oQryStr = {
               productId: this._product.prodID,
               versionId: this._versionID
            };

            switch(this._product.prodID) {
               case ahGlob.products[ahGlob.idxProducts.cmptcs].prodID:
                  oQryStr.tradeUp = 'hq';
                  oQryStr.orderReason = 6332;
                  break;
               case ahGlob.products[ahGlob.idxProducts.cmpcvf].prodID:
                  oQryStr.tradeUp = 'hq';
                  break;
               case ahGlob.products[ahGlob.idxProducts.cmpbos].prodID:
                  ret.path = '/v1/beneficialowner';
                  oQryStr.duns = this._sKey;
                  oQryStr.ownershipType = 'BENF_OWRP';
                  oQryStr.ownershipPercentage = '25';
                  oQryStr.tradeUp = 'hq';
                  break;
               default:
                  console.log('No additional query parameters');
            }

            if(this._product.prodID !== ahGlob.products[ahGlob.idxProducts.cmpbos].prodID) {
               ret.path += '/' + this._sKey;
            }
            ret.path += '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = '' + module.exports.dplAuthToken;

            return ret;
         }
      }
   },
   [ahGlob.apis[ahGlob.idxApis.apiD2o].id]: { //D&B Direct 2.0 Onboad
      authToken: {
         getHttpAttr: function() {
            const ret = {
               host: 'direct.dnb.com',
               path: '/Authentication/V2.0/',
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json'
               }
            };

            let d2o_credentials = require('./creds/d2o.json');
            ret.headers['x-dnb-user'] = d2o_credentials.usrID;
            ret.headers['x-dnb-pwd'] = d2o_credentials.pwd;

            return ret; 
         },

         getHttpPostBody: function() {
            const ret = {
               TransactionDetail: {
                  ApplicationTransactionID: 'Node.js object code'
               }
            };

            let rnd = Math.floor(Math.random() * 10000) + 1;
            let dtNow = new Date();

            ret.TransactionDetail.ServiceTransactionID = rnd.toString();
            ret.TransactionDetail.TransactionTimestamp = dtNow.toISOString();

            return ret;
         }
      },
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'direct.dnb.com',
               path: '/' + this._versionID + '/organizations/' + this._sKey + '/products/' + this._product.prodID,
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json'
               }
            };

            const oQryStr = {
               OrderReasonCode: '6332'
            };

            if(this._product.prodID === ahGlob.products[ahGlob.idxProducts.cmp_bos_d2o].prodID) {
               oQryStr.OwnershipPercentage = '25';
            }

            ret.path += '?' + qryStr.stringify(oQryStr);
            ret.headers.Authorization = '' + module.exports.d2oAuthToken;

            return ret;
         }
      }
   },
   [ahGlob.apis[ahGlob.idxApis.apiDit].id]: { //D&B Data Integration Toolkit
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'toolkit-wsdl.dnb.com',
               path: '/ws/DNB_WebServices.Providers.OrderAndInvestigations.GDP_V4:wsp_GDP_V4',
               method: 'POST',
               headers: {
                  'Content-Type': 'text/xml;charset=UTF-8',
                  SOAPAction: 'DNB_WebServices_Providers_OrderAndInvestigations_GDP_V4_wsp_GDP_V4_Binder_ws_OtherGDPProducts'
               }
            };

            return ret; 
         },

         getHttpPostBody: function() {
            const dit_credentials = require('./creds/dit.json');

            let sTrnUID = '';
            for(let i = 0; i < 12; i++) {
               sTrnUID += Math.floor(Math.random() * 16).toString(16).toUpperCase();
            }

            let ret;
            ret =  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ';
            ret +=    'xmlns:wsp="http://www.dnb.com/DNB_WebServices/Providers/OrderAndInvestigations/GDP_V4/wsp_GDP_V4">';
            ret += '<soapenv:Header/><soapenv:Body><wsp:ws_OtherGDPProducts>';
            ret += '<GDPRequest>';
            ret += '   <UserId>' + dit_credentials.usrID + '</UserId>';
            ret += '   <Password>' + dit_credentials.pwd + '</Password>';
            ret += '   <TRNUID>' + sTrnUID + '</TRNUID>';
            ret += '   <socCode><AppId>NodeJS HdR</AppId><AppVer>0010</AppVer></socCode>';
            ret += '   <Orders>';
            ret += '      <User_Language>EN</User_Language>';
            ret += '      <DnB_DUNS_Number>' + this._sKey + '</DnB_DUNS_Number>';
            ret += '      <Trade_Up_Indicator>Y</Trade_Up_Indicator>';
            ret += '      <Product>' + this._product.prodName + '</Product>';
            ret += '      <Product_Type>D</Product_Type>';
            ret += '      <Reason_Code>1</Reason_Code>';
            ret += '   </Orders>';
            ret += '   <Immediate_Delivery>';
            ret += '      <Mode>DIRECT</Mode>';
            ret += '      <Format>XML</Format>';
            ret += '   </Immediate_Delivery>';
            ret += '</GDPRequest>';
            ret += '</wsp:ws_OtherGDPProducts></soapenv:Body>';
            ret += '</soapenv:Envelope>';
            //console.log(ret);

            return ret;
         }
      }
   },
   [ahGlob.apis[ahGlob.idxApis.apiLei].id]: { //GLEIF
      dataProduct: {
         getHttpAttr: function() {
            const ret = {
               host: 'leilookup.gleif.org',
               path: '/api/' + this._versionID + '/leirecords',
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json'
               }
            };

            const oQryStr = {
               lei: this._sKey
            };

            ret.path += '?' + qryStr.stringify(oQryStr);

            return ret;
         }
      }
   }
};

//Check if the data product request is HTTP POST or GET
function isHttpPost(apiPrms) {
   return 'getHttpPostBody' in apiPrms;
}

//Function returning the result of the data product call as a promise
function execHttpReqResp() {
   let httpAttr, httpPostBody = null, prms;

   if('_token' in this) { //API call for authorization token
      prms = apiParams[this._api.id].authToken;

      httpAttr = prms.getHttpAttr();
      httpPostBody = prms.getHttpPostBody();
   }
   else { //Execute an HTTP data product request
      prms = apiParams[this._product.api.id].dataProduct;

      httpAttr = prms.getHttpAttr.call(this);

      if(isHttpPost(prms)) {
         httpPostBody = prms.getHttpPostBody.call(this);
      }
   }

   return new Promise((resolve, reject) => {
      let httpTransaction = https.request(httpAttr, resp => {
         var body = [];

         resp.on('error', err => reject(err));

         resp.on('data', chunk => body.push(chunk));

         resp.on('end', () => { //The data product is now available in full
            //As a first step register when the response was available
            this._obtainedAt = Date.now();
            this._productDB = false;

            // ... then process the raw XML/JSON response as returned by the API
            let respBody = body.join('');

            if(resp.statusCode < 200 || resp.statusCode > 299) {
               let msgInfo = 'API call returned an HTTP status code outside the 2XX range (code: ' + resp.statusCode + ').';
               console.log(msgInfo);

               let sStruct = ahGlob.dataStruct[ahGlob.idxDataStruct.json];

               if(this._product && this._product.api.struct === ahGlob.dataStruct[ahGlob.idxDataStruct.xml]) {
                  //Please note that in SOAP APIs errors are usually communicated in the HTTP
                  //response body. It is therefore unlikely to end up in this particular branch
                  //of code but it is possible (most likely involving an HTTP status code 500).
                  sStruct = this._product.api.struct;
               }

               reject(new ahErr.ApiHubErr( ahErr.idxErrMsgs.unableToLocate, //Error type code
                                           sStruct,           //The structure in which the error should be passed back
                                           msgInfo,           //Specific information concerning the error
                                           resp.statusCode,   //HTTP status code 
                                           respBody));        //String (JSON or XML) containing external API error
               return;
            }

            resolve(respBody);
         });
      });

      if(httpPostBody) {
         if(typeof httpPostBody === 'object') {
            httpTransaction.write(JSON.stringify(httpPostBody));
         }
         else {
            httpTransaction.write(httpPostBody);
         }
      }

      httpTransaction.end();
   });
}

//Return the API object based on the ID provided
const iniApi = sAPI => {
   sAPI = sAPI || ahGlob.apis[ahGlob.idxApis.apiDpl].id; //Default provided

   let oAPI = ahGlob.getAPI(sAPI);

   if(oAPI) {
      return oAPI;
   }
   else { //Throw error
      let msgInfo = 'API specified (' + sAPI + ') is not supported';
      console.log(msgInfo);

      throw new ahErr.ApiHubErr( ahErr.idxErrMsgs.instDataProduct,
                                 ahGlob.dataStruct[ahGlob.idxDataStruct.json],
                                 msgInfo );
   }
};

//Identify the correct product key in the global products array
const iniProd = sProductID => {
   sProductID = sProductID || ahGlob.products[ahGlob.idxProducts.cmpelk].prodID; //Default provided

   let oProduct = ahGlob.getProduct(sProductID);

   if(oProduct) {
      return oProduct;
   }
   else { //Throw error
      let msgInfo = 'Product identifier specified (' + sProductID + ') is not supported';
      console.log(msgInfo);

      throw new ahErr.ApiHubErr( ahErr.idxErrMsgs.instDataProduct,
                                 ahGlob.dataStruct[ahGlob.idxDataStruct.json],
                                 msgInfo );
   }
};

module.exports = {
   //The API Hub objects are event emitters so ...
   EvntEmit,
   emitConstructorEvnt,
   
   //Export the Postgres connection pool
   pgConnPool,

   //All object SQL statements
   sqlPrepStmts,

   //Http call
   execHttpReqResp,

   //Generic functions
   iniApi,
   iniProd,

   //Authorization tokens
   dplAuthToken: null,
   d2oAuthToken: null
};

const ahObjAuth = require('./ah_rpr_obj_auth.js'); //Authorization token object code
