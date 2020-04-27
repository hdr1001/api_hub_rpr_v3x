// *********************************************************************
//
// API Hub request, persist and respond web services
// JavaScript code file: ah_rpr_ws.js
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
// To run this code execute;
//    node ah_rpr_ws.js
//
// *********************************************************************
'use strict';

//Import API Hub modules
const ahGlob = require('./ah_rpr_glob.js'); //Project globals
const ahErr = require('./ah_rpr_err.js');   //Project error handling code

//Use the express library for the web services infrastructure
const express = require('express');
const appExpress = express();

//Import of built-in Node.js modules
const path = require('path');

/*
//Settings body-parser, Node.js body parsing middleware
//Documentation: https://github.com/expressjs/body-parser#body-parser
//const bodyParser = require('body-parser');
//appExpress.use(bodyParser.urlencoded({extended: true}));
//appExpress.use(bodyParser.json()); 
*/

//HTTP host server and port
const http_host = '0.0.0.0';
const http_port = 8081;

//Return JSON data in response to an HTTP request
const doSend = (req, res, sStruct, sBody, err) => {
   let sContentType = 'application/' + sStruct.toLowerCase();
   let httpStatus = ahErr.httpStatusCodes.okay;

   if(err) {
      //Make sure the error is returned with the correct HTTP status code
      httpStatus = ahErr.getHttpStatusCode(err);

      //Add the requested path to the API hub error object
      if(err.api_hub_err && req.path) err.api_hub_err.ws_path = req.path;

      //Prepare the body of the error response
      if(err.api_hub_err) {
         sBody = err.toString();
      }
      else {
         sContentType = 'application/json';
         sBody = JSON.stringify(err, null, 3);
      }
   }

   res.setHeader('Content-Type', sContentType); 
   res.status(httpStatus).send(sBody);
};

//Return application information when the top resource is requested
appExpress.get('/hub', (req, res) => {
   const ret = {
      msg: 'API Hub for requesting, persisting & passing on 3rd party API data (v3)',
      license: 'Apache license, v2.0',
      licenseDetails: 'http://www.apache.org/licenses/LICENSE-2.0',
      copyright: 'Hans de Rooij, 2019'
   };

   res.setHeader('Content-Type', 'application/json'); 
   res.status(ahErr.httpStatusCodes.okay).send(JSON.stringify(ret, null, 3));
});
/*
//Return a data product for a particular access key
appExpress.get('/hub/:sProduct/:sKey', (req, res) => {
   //console.log('Product requested: ' + req.params.sProduct);

   let oDataProd, sStruct = ahGlob.dataStruct[ahGlob.structJSON]; //JSON is default

   //Return XML if applicable
   if(api.getDataStructure(req.params.sProduct) === dataStruct[idxDataStruct.xml]) {
      sStruct = dataStruct[idxDataStruct.xml];
   }

   //Try to instantiate the data product object, errors might be thrown!
   try {
      oDataProd = api.getDataProduct(req.params.sKey, req.params.sProduct, req.query.forceNew);
   }
   catch(err) { //Error thrown while constructing data product object
      doSend(req, res, sStruct, null, err);
      return;
   }

   oDataProd.on('onLoad', () => { //Data product successfully loaded
      res.setHeader('X-API-Hub-Prod-DB', oDataProd.fromDB.toString());
      doSend(req, res, sStruct, oDataProd.rsltTxt);
   });

   oDataProd.on('onError', err => doSend(req, res, sStruct, null, err));
});

//Return a Direct+ identity resolution response (note post!)
appExpress.post('/api/idr', (req, res) => {
   const oIDR = api.getIDR(req.body);

   res.setHeader('Content-Type', 'application/json');

   oIDR.on('onLoad', () => {
      res.setHeader('X-DNB-DPL-IDR-ID', oIDR.ID);
      res.setHeader('X-DNB-DPL-HTTP-Stat', oIDR.dplHttpStatus);
      res.send(oIDR.rsltJSON);
   });

   oIDR.on('onError', () => {
      res.setHeader('X-DNB-DPL-HTTP-Stat', oIDR.dplHttpStatus);
      res.send(oIDR.rsltJSON);
   });
});

//Associate a specific DUNS with a Direct+ IDR transaction
appExpress.post('/api/idr/:idrID', (req, res) => {
   const updIdrDuns = api.doUpdIdrDuns(req.params.idrID, req.body.DUNS);

   res.setHeader('Content-Type', 'application/json');

   updIdrDuns
      .then(rowCount => {
         console.log('Successfully updated DUNS for IDR ' + req.params.idrID);
         res.send('{\"rowCount\": ' + rowCount + '}');
      })
      .catch(err => {
         console.log('Error occured updating DUNS for IDR ' + req.params.idrID);
         res.status(404).send('{\"err_msg\": \"' + err.message + '\"}');
      });
});
*/
//Backstop for requests for nonexistent resources
appExpress.use((req, res, next) => {
   let sStruct = ahGlob.dataStruct[ahGlob.idxDataStruct.json];

   let msgInfo = 'The requested resource (' + req.path + ') can not be located';
   console.log(msgInfo);

   let err = new ahErr.ApiHubErr( ahErr.idxErrMsgs.unableToLocate,
                                  ahGlob.dataStruct[ahGlob.idxDataStruct.json],
                                  msgInfo);

   doSend(req, res, sStruct, null, err);
});

//Instantiate the HTTP server object
const server = appExpress.listen(http_port, http_host, () => {
   const host = server.address().address;
   const port = server.address().port;
   
   console.log('Node.js Express server started on ' + new Date());
   console.log('Web services hosted on http://' + host + ':' + port);
});