/**
 *  Events specific unit tests testing the Client EventEmitter and instance
 *  scoped events on resources.
 *
 *  @module tests-event
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

const client = require('../lib/client.js');
const _ = require('lodash');
const portfinder = require('portfinder');
const http = require('http');
const assert = require('assert');
const helpers = require('./helpers.js');

describe('events', () => {

  const user = 'user';
  const pass = 'secret';
  let url;
  let ari;
  let server;
  let wsserver;

  before((done) => {
    portfinder.getPort((err, port) => {
      assert.ifError(err);

      server = helpers.buildMockServer(port);
      server.realServer = http.createServer(server.handler);
      server.realServer.listen(port, () => {
        url = `http://localhost:${port}`;
        client.connect(url, user, pass, (err, connectedClient) => {
          ari = connectedClient;
          wsserver = helpers.createWebSocketServer(server.realServer);
          ari.start('unittests');

          // ensure socket is connected before tests start
          setTimeout(done, 1000);
        });
      });
    });
  });

  after((done) => {
    ari.stop();
    server.realServer.close(done);
  });

  describe('#client', () => {
    it('should have event functions', () => {
      assert(_.isFunction(ari.on), 'on exists');
      assert(_.isFunction(ari.once), 'once exists');
      assert(_.isFunction(ari.addListener), 'addListener exists');
      assert(_.isFunction(ari.removeListener), 'removeListener exists');
    });

    it('should receive all events', (done) => {
      let count = 0;
      ari.on('PlaybackFinished', (event, playback) => {
        count += 1;

        if (count === 2) {
          done();
        }
      });

      for (let i = 0; i < 2; i++) {
        const id = i.toString();
        wsserver.send({
          type: 'PlaybackFinished',
          playback: {
            id: id,
            state: 'complete',
            'media_uri': 'sound:hello-world'
          }
        });
      }
    });
  });

  describe('#resources', () => {
    it('should have event functions', () => {
      const bridge = ari.Bridge();
      assert(_.isFunction(bridge.on), 'on exists');
      assert(_.isFunction(bridge.addListener), 'addListener exists');
      assert(_.isFunction(bridge.removeListener), 'removeListener exists');
      assert(
        _.isFunction(bridge.removeAllListeners),
        'removeAllListeners exists'
      );
      assert(_.isFunction(bridge.once), 'once exists');
    });

    it('should have scoped events', (done) => {
      let count = 0;
      let bridge1Count = 0;
      ari.removeAllListeners('BridgeDestroyed');
      ari.on('BridgeDestroyed', (event, bridge) => {
        count += 1;

        if (count === 2 && bridge1Count === 1) {
          done();
        }
      });

      const bridge1 = ari.Bridge();
      const bridge2 = ari.Bridge();

      bridge1.on('BridgeDestroyed', (event, bridge) => {
        bridge1Count += 1;
      });

      wsserver.send({
        type: 'BridgeDestroyed',
        bridge: {
          id: bridge1.id
        }
      });

      wsserver.send({
        type: 'BridgeDestroyed',
        bridge: {
          id: bridge2.id
        }
      });
    });

    it('should allow multiple scoped events', (done) => {
      let count = 0;
      let channel1Count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
      ari.on('ChannelDtmfReceived', (event, channel) => {
        count += 1;

        if (count === 2 && channel1Count === 2) {
          done();
        }
      });

      const channel1 = ari.Channel();
      const channel2 = ari.Channel();

      channel1.on('ChannelDtmfReceived', (event, channel) => {
        channel1Count += 1;
      });

      channel1.on('ChannelDtmfReceived', (event, channel) => {
        channel1Count += 1;
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel2.id
        }
      });
    });

    it('should allow scoped events that fire only once', (done) => {
      let count = 0;
      let channel1Count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
      ari.on('ChannelDtmfReceived', (event, channel) => {
        count += 1;

        if (count === 2 && channel1Count === 1) {
          done();
        }
      });

      const channel1 = ari.Channel();

      channel1.once('ChannelDtmfReceived', (event, channel) => {
        channel1Count += 1;
        if (channel1Count > 1) {
          throw new Error('Should not have received this event');
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel1.id
        }
      });
    });

    it('should allow removing specific scoped events', (done) => {
      let count = 0;
      let channel1Count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
      ari.on('ChannelDtmfReceived', (event, channel) => {
        count += 1;

        if (count === 2 && channel1Count === 1) {
          done();
        }
      });

      const channel1 = ari.Channel();
      const channel2 = ari.Channel();

      channel1.on('ChannelDtmfReceived', (event, channel) => {
        channel1Count += 1;
      });

      const callback = (event, channel) => {
        throw new Error('Should not have received this event');
      };

      channel2.on('ChannelDtmfReceived', callback);
      channel2.removeListener('ChannelDtmfReceived', callback);

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel2.id
        }
      });
    });

    it('should allow removing all scoped events', (done) => {
      let count = 0;
      ari.removeAllListeners('ChannelDtmfReceived');
      ari.on('ChannelDtmfReceived', (event, channel) => {
        count += 1;

        if (count === 2) {
          done();
        }
      });

      const channel1 = ari.Channel();

      channel1.on('ChannelDtmfReceived', (event, channel) => {
        throw new Error('Should not have received this event');
      });

      channel1.on('ChannelDtmfReceived', (event, channel) => {
        throw new Error('Should not have received this event');
      });

      channel1.removeAllListeners('ChannelDtmfReceived');

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '1',
        channel: {
          id: channel1.id
        }
      });

      wsserver.send({
        type: 'ChannelDtmfReceived',
        digit: '2',
        channel: {
          id: channel1.id
        }
      });
    });

  });
});

