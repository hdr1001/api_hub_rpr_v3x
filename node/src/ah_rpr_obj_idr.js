// *********************************************************************
//
// API Hub request, persist & respond IDentity Resolution code
// JavaScript code file: ah_rpr_obj_idr.js
//
// Copyright 2020 Hans de Rooij
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

//Write the Direct+ IDR parameters to the database
function dplIdrParamsToDb() {
   return new Promise((resolve, reject) => {
      ahGlobObj.pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(ahGlobObj.sqlPrepStmts.insDnbDplIdrParams.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error running persist Direct+ IDR parameters query');
               reject(err); return;
            }

            resolve(this._Id = rslt.rows[0].id);
         });
      });
   });
};

//Write the Direct+ IDR results to the database
function dplIdrResultsToDb() {
   return new Promise((resolve, reject) => {
      ahGlobObj.pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(ahGlobObj.sqlPrepStmts.updDnbDplIdrResults.call(this), (err, rslt) => {
            done(err);

            if(err) {
               console.log('Error running persist Direct+ IDR results query');
               reject(err); return;
            }

            resolve(rslt.rowCount);
         });
      });
   });
};

//Definition of class DnbDplIdr (i.e. D&B Direct+ IDentity Resolution)
class DnbDplIdr extends ahGlobObj.EvntEmit {
   constructor(params) {
      super(); //Call necessary to resolve the currect execution context (this) in the extended class

      //Private object properties
      this._params = params;      //Object containing IDR search criteria
      this._Id = null;            //Primary key to IDR record on the database
      this._dplHttpStatus = null; //HTTP status code returned by Direct+
      this._obtainedAt = null;    //Timestamp -> IDR response available
      this._rawRsltIdr = null;    //The JSON as returned by the API
      this._objRsltIdr = null;    //Object representation of the identity resolution results

      //Below the implementation of the primary object logic
      Promise.all([ahGlobObj.execHttpReqResp.call(this), dplIdrParamsToDb.call(this)])
         .then(arrResolve => {
            //console.log(arrResolve[0]); //Echo the JSON returned by the API
            //console.log(arrResolve[1]); //Echo the primary key ID of the database row

            //Create a reference to the JSON returned by the D+ IDR call
            this._rawRsltIdr = arrResolve[0];

            console.log('About to emit onLoad for object of class DnbDplIdr');
            ahGlobObj.emitConstructorEvnt(this, 'onLoad');
            
            //Both the ID and IDR results are now available, update the database accordingly
            return dplIdrResultsToDb.call(this);
         })
         .then(rowCount => {
            if(rowCount != 1) {
               console.log('Hmmm rowCount = ' + rowCount + ', should be 1!');
            }
            else {
               console.log('Persisted the D&B IDR match candidates');
            }
         })
         .catch(err => {
            console.log('Error occured in constructor of class DnbDplIdr!');
            //console.log(this._rawRsltIdr);

            console.log('About to emit onError for object of class DnbDplIdr');
            ahGlobObj.emitConstructorEvnt(this, 'onError', err);
         });
   }

   //Public object interface
   get params() {   //Object containing IDR search criteria passed into the constructor
      return this._params;
   }

   get Id() { //Direct+ IDentity Resolution identifier
      return this._Id;
   }

   get dplHttpStatus() { //Direct+ HTTP status code returned
      return this._dplHttpStatus;
   }

   get obtainedAt() { //Timestamp -> IDR response available
      return this._obtainedAt;
   }

   get rsltJSON() { //JSON as returned by the Direct+ API
      if(this._rawRsltIdr) return this._rawRsltIdr;

      throw new Error('Raw IDR results not (yet) available');
   }

   get rsltObj() {  //Return the IDR results as a JavaScript object
      if(this._objRsltIdr) return this._objRsltIdr;

      if(this._rawRsltIdr) {
         return this._objRsltIdr = JSON.parse(this._rawRsltIdr);
      }

      throw new Error('IDR results not (yet) available');
   }
}
/*
//Update the DUNS database column for a specific IDR ID
function updIdrDunsToDB(idrID, DUNS) {
   return new Promise((resolve, reject) => {
      pgConnPool.connect((err, client, done) => {
         if(err) {
            console.log('Error fetching client from pool');
            reject(err); return;
         }

         client.query(sqlPrepStmts.updDplIdrDuns([DUNS, idrID]), (err, rslt) => {
            done(err);

            if(err || rslt.rowCount != 1) {
               console.log('Error running DUNS persist Direct+ IDR query');
               
               if(!err) {
                  err = new Error('IDR DUNS persist error, rowCount = ' + rslt.rowCount);
               }

               reject(err); return;
            }

            resolve(rslt.rowCount);
         });
      });
   });
}
*/

module.exports = Object.freeze({
   //DnbDplIdr object instantiantion exported as a function
   getDnbDplIdr: params => new DnbDplIdr(params)
});
