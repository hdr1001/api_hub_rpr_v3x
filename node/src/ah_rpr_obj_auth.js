// *********************************************************************
//
// API Hub request, persist & respond authorization token object
// JavaScript code file: ah_rpr_obj_auth.js
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
const ahGlobObj = require('./ah_rpr_glob_obj.js'); //Project globals for objects

//Get the most recent authorization token from the database,
//return 0 if no token is available
function getAuthTokenDB() {
   return new Promise((resolve, reject) => {
      ahGlobObj.pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(ahGlobObj.sqlPrepStmts.getAuthToken.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error executing get authorization token query');
               reject(err); return;
            }

            if(rslt.rowCount > 0) {
               this._id = rslt.rows[0].id;
               this._token = rslt.rows[0].token;
               this._expiresIn = rslt.rows[0].expires_in;
               this._obtainedAt = rslt.rows[0].obtained_at;
            }

            resolve(rslt.rowCount);
         });
      });
   });
}

//Write an authorization token to the database
function authTokenToDB() {
   return new Promise((resolve, reject) => {
      ahGlobObj.pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(ahGlobObj.sqlPrepStmts.insAuthToken.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error running persist authorization token query');
               reject(err); return;
            }

            resolve(rslt.rows[0].id);
         });
      });
   });
}

//Process the results returned from the call to retrieve a token from the database
function processAuthTokenDB(rowCount) {
   let bRenewToken = false;

   if(rowCount > 0) {
      console.log('Token (' + this._api.id +  ') retrieved from database = ' + this._token.substring(0, 3) +
         ' ... ' + this._token.substring(this._token.length - 2));

      if(!this._token || this._token.length === 0 || this.renewAdvised) {
         console.log('Token invalid or (nearly) expired, get new token online');
         bRenewToken = true;
      }
      else {
         //No need to renew the authorization token
         console.log('Token validated okay (' + this.expiresInMins + ' minutes remaining)');
         ahGlobObj.emitConstructorEvnt(this, 'onLoad');
         return bRenewToken; //bRenewToken === false
      }
   }

   //bRenewToken === true, i.e get a new authorization token online
   return ahGlobObj.execHttpReqResp.call(this);
}

//Parse authorization token as delivered by the API
function parseJsonToken(jsonToken) {
   let oToken = JSON.parse(jsonToken);

   switch(this._api.id) {
      case ahGlob.apis[ahGlob.idxApis.apiDpl].id:
         this._token = oToken.access_token;
         this._expiresIn = oToken.expiresIn;
         break;

      case ahGlob.apis[ahGlob.idxApis.apiD2o].id:
         this._token = oToken.AuthenticationDetail.Token;
         this._expiresIn = 86400; //Specified in the documentation
         break;

      default:
         console.log('Unsupported API parsing JSON token');
   }

   //Update the values of the object's private member variables
   return oToken;
}

//Process the results returned from the API call to retrieve a token online
function processAuthTokenAPI(jsonAuthToken) {
   if(jsonAuthToken) {
      console.log('Successfully retrieved a new ' + this._api.id + ' authorization token online!');
      parseJsonToken.call(this, jsonAuthToken); //Parse the JSON delivered & set the object properties
      ahGlobObj.emitConstructorEvnt(this, 'onLoad');

      //As a last step persist the token on the database
      return authTokenToDB.call(this);
   }

   return 0;
}

//Process the new token ID generated by the database insert
function processNewTokenID(tokenID) {
   if(tokenID) {
      this._id = tokenID;
      console.log('Persisted token, with id ' + tokenID);
   }

   return 0;
}

//Error handler of primary constructor logic authorization token class
function errHandlerAuthToken(err) {
   console.log('Error occured in constructor of class AuthToken! Parameter api: ' + this._api.id);
   console.log(err.message);

   console.log('About to emit onError for object of class AuthToken');
   ahGlobObj.emitConstructorEvnt(this, 'onError');
}

//Periodic token validity check and, if necessary, renewal
function periodicCheckAuthToken() {
   console.log('API ' + this._api.id + ' token check at ' + new Date());

   if(this.renewAdvised) {
      console.log('API ' + this._api.id + ' token about to expire or expired, going online');

      ahGlobObj.execHttpReqResp.call(this)
         .then( jsonAuthToken => processAuthTokenAPI.call(this, jsonAuthToken) )
         .then( tokenID => processNewTokenID.call(this, tokenID) )
         .catch( err => errHandlerAuthToken.call(this, err) );
   }
   else {
      console.log('Authorization token for api ' + this._api.id + ' verifies okay, ' + 
         this.expiresInMins + ' minutes remaining');
   }
}

//Definition of the authorization token class
class AuthToken extends ahGlobObj.EvntEmit {
   constructor(api) {
      super(); //Call necessary to resolve the current execution context (this) in the extended class

      //Private object properties
      this._api = ahGlobObj.iniApi(api);    //Store the API for which this token is valid
      this._id = null;                      //Unique token sequence number & primary key
      this._token = null;                   //Token for use in the Authorization header
      this._expiresIn = null;               //Number of secs until the token expires (from when it was retrieved)
      this._obtainedAt = null;              //Timestamp -> IDR response available

      //Below the implementation of the primary constructor logic
      getAuthTokenDB.call(this)
         .then( rowCount => processAuthTokenDB.call(this, rowCount) )
         .then( jsonAuthToken => processAuthTokenAPI.call(this, jsonAuthToken) )
         .then( tokenID => processNewTokenID.call(this, tokenID) )
         .catch( err => errHandlerAuthToken.call(this, err) );

      //Check every 30 mins whether the authorization token is up for renewal
      this._chkInterval = setInterval( periodicCheckAuthToken.bind(this), 1800000 );
   }

   //Public object interface
   toString() { //Converts the value of an AuthToken object instance to a string
      if(this._token.length === 0) {
         return '';
      }
      else {
         switch(this._api.id) {
            case ahGlob.apis[ahGlob.idxApis.apiDpl].id:
               return 'Bearer ' + this._token;

            default:
               return this._token;
         }
      }
   }

   get token() { //Return token for use in an HTTP Authorization header
      return this._token;
   }

   get expiresInMins() { //Return the number of minutes until the token expires
      if(this._expiresIn === 0 || this._obtainedAt === undefined) return 0;

      let mins = (this._obtainedAt + (this._expiresIn * 1000) - Date.now()) / 60000;

      return Math.floor(mins);
   }

   get renewAdvised() { //Answer the question; should this authorization token be renewed?
      if(this.expiresInMins < 76) {
         return true;
      }
      else { 
         return false;
      }
   }
}

// Global variables holding the authorization tokens
let dplAuthToken = null;
let d2oAuthToken = null;

setTimeout(() => {dplAuthToken = new AuthToken(ahGlob.apis[ahGlob.idxApis.apiDpl].id)}, 2500);
setTimeout(() => {d2oAuthToken = new AuthToken(ahGlob.apis[ahGlob.idxApis.apiD2o].id)}, 3000);

module.exports = Object.freeze({
   dplAuthToken,
   d2oAuthToken
});