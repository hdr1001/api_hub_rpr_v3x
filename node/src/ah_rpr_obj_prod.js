// *********************************************************************
//
// API Hub request, persist & respond data product object code
// JavaScript code file: ah_rpr_obj_prod.js
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
const ahGlob = require('./ah_rpr_glob.js');        //Project globals
const ahErr = require('./ah_rpr_err.js');          //Project error handling code
const ahGlobObj = require('./ah_rpr_glob_obj.js'); //Project globals for objects

//Validate the key associated with the data product
function iniKey(sKey) {
   switch(this._product.key) {
      case ahGlob.keys[ahGlob.idxKeys.duns]: // i.e. DUNS
         //Remove dashes from the DUNS submitted and,
         sKey = sKey.replace(/-/g, '');
         //After the removal of the dashes the DUNS should only contain numeric characters
         let regExp = /^\d+$/;
         if(!regExp.test(sKey)) {
            let msgInfo = 'DUNS submitted (' + sKey + ') contains ';
            msgInfo += 'non-numeric characters and is therefore invalid';
            console.log(msgInfo);

            throw new ahErr.ApiHubErr( ahErr.idxErrMsgs.instDataProduct,
                                       this._product.api.struct,
                                       msgInfo );
         }
         //Prepend 0's in case the DUNS is shorter than 9 characters,
         if(sKey.length < 9) {
            return '000000000'.substring(0, 9 - sKey.length).concat(sKey);
         }
         else {
            return sKey;
         }
      default:
         return sKey;
   }
}

function iniForceNew(bForceNew) {
   //forceNew is false except if query string contains forceNew=true
   if(typeof bForceNew === 'boolean') {
      return bForceNew;
   }
   else { //String comparison
      return (bForceNew === 'true');
   }
}

function iniVersionID(sVersionID) {
   //Default product version
   if(sVersionID) {
      if(this._product.versions.indexOf(sVersionID) === -1) {
         let msgInfo = 'Version identifier specified (' + sVersionID + ') is not supported';
         console.log(msgInfo);

         throw new ahErr.ApiHubErr( ahErr.idxErrMsgs.instDataProduct,
                                    this._product.api.struct,
                                    msgInfo );
      }
      else {
         return sVersionID;
      }
   }
   else { //Default value is the most recent version
      return this._product.versions[this._product.versions.length - 1];
   }
}

//Get a data product from the database, resolve to 0 if not available
function getDataProductDB() {
   return new Promise((resolve, reject) => {
      let ret_val = 0;

      if(this._forceNew) {
         resolve(ret_val); //Force new, no need to check the database
      }
      else {
         ahGlobObj.pgConnPool.connect((err, client, done) => {
            if(err) {
               console.log('Error fetching client from pool');
               reject(err); return;
            }

            client.query(ahGlobObj.sqlPrepStmts.getDataProduct.call(this), (err, rslt) => {
               done(err);

               if(err) {
                  console.log('Error executing get product from database query');
                  reject(err); return;
               }

               if(rslt.rowCount > 0) {
                  if(rslt.rows[0].product) {
                     if(this._product.api.struct === ahGlob.dataStruct[ahGlob.idxDataStruct.xml]) {
                         this._rawRsltProduct = rslt.rows[0].product;
                     }
                     else {
                        this._objRsltProduct = rslt.rows[0].product;
                     }
                     this._obtainedAt = rslt.rows[0].poa;
                     this._productDB = true;

                     ret_val = rslt.rowCount;
                  }
               }

               resolve(ret_val);
            });
         });
      }
   });
}

//Write the data product to the database
function DataProductToDB() {
   return new Promise((resolve, reject) => {
      ahGlobObj.pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(ahGlobObj.sqlPrepStmts.insDataProduct.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error executing persist data product query');
               reject(err); return;
            }

            resolve(0);
         });
      });
   });
}

//Process the raw data product returned by the HTTP response
function processHttpResp(respBody) {
   if(this._product.api.id === ahGlob.apis[ahGlob.idxApis.apiDit].id) {
      //Parse the HTTP response
      this._objRsltProduct = ahGlob.domParser.parseFromString(respBody, 'text/xml');

      //Strip the SOAP envelope from the response
      this._objRsltProduct = this._objRsltProduct.getElementsByTagName('DGX')[0];

      //The stripped product will be written to the database
      this._rawRsltProduct = ahGlob.xmlSerializer.serializeToString(this._objRsltProduct);

      //The D&B Data Integration Toolkit is a SOAP API and therefore tends to
      //communicate errors in the message body (where REST APIs are more likely
      //to use HTTP status codes out of the 2XX range). This implies that, in
      //order to implement robust error handling, the response must be checked
      //for error codes.
      let iStatus; //Integer value of the main status code reurned

      let statusNodes = this._objRsltProduct.getElementsByTagName('STATUS');
      let statusCodeNode = null;

      for(let i = 0; i < statusNodes.length; i++) {
         iStatus = null;

         statusCodeNode = statusNodes[i].getElementsByTagName('CODE')[0];

         if(statusCodeNode) {
            iStatus = parseInt(statusCodeNode.childNodes[0].nodeValue);
         }

         if(iStatus === null || isNaN(iStatus) || iStatus !== 0) {
            let msgInfo = '<![CDATA[D&B Toolkit GDP request returned an error status code';
            msgInfo += ' (code: ' + iStatus + ')]]>';

            throw new ahErr.ApiHubErr( ahErr.idxErrMsgs.httpStatusExtApi, //Error type code
                                       ahGlob.dataStruct[ahGlob.idxDataStruct.xml], //The structure in which the error should be passed back
                                       msgInfo,                           //Specific information concerning the error
                                       null,                              //HTTP status code not available
                                       this._rawRsltProduct);             //String (JSON or XML) containing external API error
         }
      }
   }
   else {
      this._rawRsltProduct = respBody;
   }
}

//Definition of class DataProduct to retrieve API delivered data products
class DataProduct extends ahGlobObj.EvntEmit {
   constructor(sKey, prodID, forceNew, versionID) {
      super(); //Call necessary to resolve the currect execution context (this) in the extended class

      //Initialization of the private object properties. Please note that the
      //functions used to initialize object instance properties can, under
      //specific conditions, throw errors. It's therefore advised to implement
      //a try-catch block when instantiating a DataProduct.
      this._product = ahGlobObj.iniProd(prodID);            //Product object has prodID, provider, api & key properties
      this._sKey = iniKey.call(this, sKey);                 //The key with which the data product is associated
      this._forceNew = iniForceNew(forceNew);               //If true the product will retrieved online not from the database
      this._versionID = iniVersionID.call(this, versionID); //The data product version
      this._productDB = null;                               //Boolean indicating whether the data product was retrieved from the database
      this._obtainedAt = null;                              //Timestamp -> data product available
      this._rawRsltProduct = null;                          //The XML/JSON as returned by the API
      this._objRsltProduct = null;                          //Object representation of the data product

      //This is where the rubber meets the road. Default behaviour of the API
      //is to first check the database for availability of the requested key.
      //If the forceNew parameter is set to true the function getDataProductDB
      //immediately resolves to a row count of zero to, in this way, trigger
      //an online product request. If forceNew is not true (which is default)
      //the function getDataProductDB resolves to either 0 or 1, i.e. no
      //product available or product available on the database.
      getDataProductDB.call(this)
         .then(rowCount => {
            let sMsg = 'Retrieved ' + rowCount + ' row(s) '; 
            sMsg += 'for product ' + this._product.prodID + ' with ';
            sMsg += 'key ' + this._sKey;
            console.log(sMsg);

            //Please note that the row count can be zero becase (1) the forceNew
            //parameter was set to true or (2) the database does not contain the
            //sKey requested. Either way, in case the row count returned is zero
            //a new data product will be requested online.
            if(rowCount === 0) {
               return ahGlobObj.execHttpReqResp.call(this);
            }
            //The data product was loaded from the datatabse in function
            //getDataProductDb. Additional work is needed here but the on
            //load event can be fired if the row count != zero (i.e. 1)
            else {
               ahGlobObj.emitConstructorEvnt(this, 'onLoad');
            }

            return false; //Data product loaded was from the database
         })
         .then(httpRespBody => {
            //There is no need to store the product if it was retrieved from the
            //database. The parameter rawProduct will evaluate to null if this is
            //so and the body of the if clause below will not execute. For a data
            //product loaded from cache the onLoad event has already fired at
            //this point. In case, however, a new data product was retrieved
            //(successfully) online, the parameter rawProduct evaluates to true
            //and the body of the if clause will be processed. First the onLoad
            //is emitted, then the new product is stored on the database. When
            //storing new products old products are automatically archived.
            if(httpRespBody) {
               this._productDB = false; //API Hub product retrieved from API

               processHttpResp.call(this, httpRespBody);

               console.log('About to emit onLoad for API ' + this._product.api.id + ', key ' + this._sKey + ' (obtained online)');
               ahGlobObj.emitConstructorEvnt(this, 'onLoad');

               DataProductToDB.call(this);
            }
         })
         .catch(err => {
            console.log('Error occured in constructor of class DataProduct!');
            //console.log(this._rawRsltProduct);

            console.log('About to emit onError for object of class DataProduct');
            ahGlobObj.emitConstructorEvnt(this, 'onError', err);
         });
   }

   //Public object interface
   get sKey() { //The sKey with which the data product is associated
      return this._sKey;
   }

   get forceNew() { //If true the product will be retrieved online not from the database
      return this._forceNew;
   }

   get prodID() { //The data product
      return this._product.prodID;
   }

   get versionID() { //Version of the D&B data product
      return this._versionID;
   }

   get fromDB() { //Was the data product retrieved from the database?
      return this._productDB;
   }

   get obtainedAt() { //Timestamp -> data product available
      return this._obtainedAt;
   }

   get rsltTxt() { //Sructured text (i.e. XML/JSON) as returned by the API
      if(this._rawRsltProduct) return this._rawRsltProduct;

      if(this._objRsltProduct) {
         if(this._product.api.struct === ahGlob.dataStruct[ahGlob.idxDataStruct.xml]) {
            return this._rawRsltProduct = ahGlob.xmlSerializer.serializeToString(this._objRsltProduct);
         }
         else { //JSON
            return this.rawRsltProduct = JSON.stringify(this._objRsltProduct);
         }
      }

      throw new Error('Raw data product results not (yet) available');
   }

   get rsltObj() {  //Return the data product as a JavaScript object
      if(this._objRsltProduct) return this._objRsltProduct;

      if(this._rawRsltProduct) {
         if(this._product.api.struct === ahGlob.dataStruct[ahGlob.idxDataStruct.xml]) {
            return this._objRsltProduct = ahGlob.domParser.parseFromString(this._rawRsltProduct, 'text/xml');
         }
         else {
            return this._objRsltProduct = JSON.parse(this._rawRsltProduct);
         }
      }

      throw new Error('Data product results not (yet) available');
   }
}

module.exports = Object.freeze({
   //Object instantiantion exported as a function
   getDataProduct: (key, product, forceNew, versionID) => new DataProduct(key, product, forceNew, versionID)
});
