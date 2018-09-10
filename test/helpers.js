/**
 *  Unit test helpers.
 *
 *  @module tests-helpers
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

const hock = require('hock');
const fs = require('fs');
const moment = require('moment');
const ws = require('ws');
const _ = require('lodash');

/**
 *  Creates a web socket server that can be used to send messages to a unit test
 *  ARI client for the purposes of mocking events.
 *
 *  @function createWebSocketServer
 *  @memberof module:tests-helpers
 *  @param {Object} httpserver - http server to attach web socket server to
 *  @returns {module:tests-helpers.WebSocketServer} web socket server
 */
function createWebSocketServer (httpserver) {
  let server = new ws.Server({server: httpserver});
  let socket = null;
  /**
   *  Store the incoming websocket for future use.
   *
   *  @param {WebSocket} socket - socket for the last connection
   */
  const processConnection = (websocket) => {
    socket = websocket;
  };

  server.on('connection', processConnection);

  /**
   *  Web socket server with a send method that will send a message to a
   *  listening web socket.
   *
   *  @class WebSocketServer
   *  @memberof module:tests-helpers
   *  @property {Function} send - send a message to the listening socket
   */
  return {
    /**
     *  Sends the json message to the currently connected socket.
     *
     *  @param {Object} msg - the json message to send
     */
    send(msg) {
      if (socket) {
        socket.send(JSON.stringify(msg));
      }
    },

    /**
     *  Disconnects the server and reconnects.
     *
     *  This is intended to test client auto-reconnect.
     */
    reconnect() {
      server.close(() => {
        server = new ws.Server({server: httpserver});
        server.on('connection', processConnection);
      });
    }
  };
}

/**
 *  Sets up a hock API mock to support running ari-hockServer.connect.
 *
 *  @function mockClient
 *  @memberof module:tests-helpers
 *  @param {number} port the port to run the server on
 *  @returns The hock mock server
 */
function buildMockServer(port) {
  const hockServer = hock.createHock();

  const body = readJsonFixture('resources', port);
  const headers = getJsonHeaders(body);
  hockServer
      .get('/ari/api-docs/resources.json')
      .any()
      .reply(200, body, headers);
  const resources = [
    'recordings',
    'bridges',
    'endpoints',
    'asterisk',
    'sounds',
    'channels',
    'playbacks',
    'deviceStates',
    'mailboxes',
    'applications',
    'events',
  ];

  // setup resource APIs
  _.each(resources, (resource) => {
    const resourceBody = readJsonFixture(resource, port);
    const resourceHeaders = getJsonHeaders(resourceBody);
    hockServer
      .get(`/ari/api-docs/${resource}.json`)
      .any()
      .reply(200, resourceBody, resourceHeaders);
  });

  return hockServer;
}

/**
 *  Returns a json fixture representing an ARI response body.
 *
 *  @function readJsonFixture
 *  @memberof module:tests-helpers
 *  @private
 *  @param {string} filename - the name of the fixture
 *  @param {integer} port - the port the server is running on
 *  @returns {string} the string representation of the json fixture
 */
function readJsonFixture (filename, port) {
  // remove the last newline if it exists
  const json = fs.readFileSync(
    `${__dirname}/fixtures/${filename}.json`,
    'utf8'
  )
  .replace(/\n$/, '')
  .replace(/8088/g, port);
  return json;
}

/**
 *  Returns the headers found in an ARI response.
 *
 *  @function getJsonHeaders
 *  @memberof module:tests-helpers
 *  @param {string} json - json body of the response
 *  @returns {Object} header object to be used in mocking json responses
 */
function getJsonHeaders (json) {
  return {
    'server': 'Asterisk/SVN-branch-12-r410918M',
    'date': moment().utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'),
    'connection': 'close',
    'cache-control': 'no-cache, no-store',
    'content-length': `${json.length}`,
    'content-type': 'application/json',
  };
}

module.exports.buildMockServer = buildMockServer;
module.exports.getJsonHeaders = getJsonHeaders;
module.exports.createWebSocketServer = createWebSocketServer;

