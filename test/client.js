/**
 *  Client specific unit tests.
 *
 *  @module tests-client
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

const assert = require('assert');
const _ = require('lodash');
const Promise = require('bluebird');
const http = require('http');
const portfinder = require('portfinder');
const client = require('../lib/client.js');
const helpers = require('./helpers.js');

const operations = {
  asterisk: [
    'getInfo',
    'getGlobalVar',
    'setGlobalVar'
  ],
  applications: [
    'list',
    'get',
    'subscribe',
    'unsubscribe'
  ],
  bridges: [
    'list',
    'clearVideoSource',
    'create',
    'createWithId',
    'get',
    'destroy',
    'addChannel',
    'removeChannel',
    'setVideoSource',
    'startMoh',
    'stopMoh',
    'play',
    'playWithId',
    'record'
  ],
  channels: [
    'list',
    'originate',
    'get',
    'originateWithId',
    'hangup',
    'continueInDialplan',
    'answer',
    'ring',
    'ringStop',
    'sendDTMF',
    'mute',
    'unmute',
    'hold',
    'unhold',
    'startMoh',
    'stopMoh',
    'startSilence',
    'stopSilence',
    'play',
    'playWithId',
    'record',
    'getChannelVar',
    'setChannelVar',
    'snoopChannel',
    'snoopChannelWithId'
  ],
  deviceStates: [
    'list',
    'get',
    'update',
    'delete'
  ],
  endpoints: [
    'list',
    'listByTech',
    'get'
  ],
  mailboxes: [
    'list',
    'get',
    'update',
    'delete',
  ],
  playbacks: [
    'get',
    'stop',
    'control',
  ],
  recordings: [
    'listStored',
    'getStored',
    'getStoredFile',
    'deleteStored',
    'getLive',
    'cancel',
    'stop',
    'pause',
    'unpause',
    'mute',
    'unmute'
  ],
  sounds: [
    'list',
    'get'
  ]
};

describe('client', () => {

  let url;
  const hostIsNotReachableUrls = {
    ENOTFOUND: 'http://notthere:8088',
    ECONNREFUSED: 'http://localhost:65535',
  };
  const user = 'user';
  const pass = 'secret';
  let ari = null;
  let server = null;
  let wsserver = null;

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
          done();
        });
      });
    });
  });

  after((done) => {
    ari.stop();
    server.realServer.close(done);
  });

  it('should connect', (done) => {
    client.connect(url, user, pass, done);
  });

  it('should send an error on ENOTFOUND', (done) => {
    client.connect(
      hostIsNotReachableUrls.ENOTFOUND, user, pass, (err) => {
      if (err && err.name === 'HostIsNotReachable') {
        done();
      } else {
        assert.fail(`Should not be able to connect to ${hostIsNotReachableUrls.ENOTFOUND}`);
      }
    });
  });

  it('should send an error on ECONNREFUSED', (done) => {
    client.connect(
      hostIsNotReachableUrls.ECONNREFUSED, user, pass, (err) => {
      if (err && err.name === 'HostIsNotReachable') {
        done();
      } else {
        assert.fail(`Should not be able to connect to ${hostIsNotReachableUrls.ECONNREFUSED}`);
      }
    });
  });

  it('should auto-reconnect websocket', (done) => {
    wsserver.reconnect();

    setTimeout(() => {
      ari.on('PlaybackFinished', (event, playback) => {
        assert(playback.id === 1);

        done();
      });

      wsserver.send({
        type: 'PlaybackFinished',
        playback: {
          id: 1
        }
      });
    }, 1000);
  });

  it('should not auto-reconnect websocket after calling stop', (done) => {
    ari.stop();

    setTimeout(() => {
      try {
        wsserver.send({
          type: 'PlaybackFinished'
        });
      } catch (err) {
        ari.start('unittests');

        done();
      }
    }, 1000);
  });

  it('send reconnect lifecycle events', (done) => {
    client.connect(url, user, pass, (err) => {
      if (err) { return done(err); }
      wsserver.reconnect();
      ari.once('WebSocketReconnecting', () => {
        ari.once('WebSocketConnected', () => {
          done();
        });
      });
    });
  });

  // note: need a function here to ensure the `this`reference points to mocha
  it('can reconnect a lot if it can successfully connect', function (done) {
    let reconnectCount = 20;

    // this test might be a bit slow
    this.timeout(60000);

    client.connect(url, user, pass, (err) => {
      if (err) { return done(err); }

      const doItAgain = () => {
        if (reconnectCount-- === 0) {
          done();
          return;
        }

        wsserver.reconnect();
        ari.once('WebSocketConnected', () => {
          doItAgain();
        });

        ari.once('WebSocketMaxRetries', () => {
          assert.fail('Should not have given up reconnecting');
        });
      };

      doItAgain();
    });
  });

  it('should connect using promises', () => {
    return client.connect(url, user, pass).then((client) => {
      if (!client) {
        throw new Error('should have a client here');
      }
    });
  });

  it('should have all resources', () => {
    const candidates = _.keys(ari);
    const expected = [
      'asterisk',
      'applications',
      'bridges',
      'channels',
      'deviceStates',
      'endpoints',
      'events',
      'mailboxes',
      'playbacks',
      'recordings',
      'sounds'
    ];
    _.each(expected, (resource) => {
      assert(_.includes(candidates, resource));
      assert(_.isObject(ari[resource]));
    });
  });

  it('should have all instance creators', () => {
    const candidates = _.keys(ari);
    const expected = [
      'Bridge',
      'Channel',
      'Playback',
      'LiveRecording'
    ];
    _.each(expected, (creator) => {
      assert(_.includes(candidates, creator));
      assert(_.isFunction(ari[creator]));
    });
  });

  describe('#resources', () => {
    _.each(operations, (value, key) => {
      it(`${key} should have all operations`, () => {
        const candidates = _.keys(ari[key]);
        const expected = value;

        _.each(expected, (resource) => {
          assert(_.includes(candidates, resource));
          assert(_.isFunction(ari[key][resource]));
        });
      });
    });

    it('should support promises', () => {
      const bridge = ari.Bridge('promises');

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});
      const validate = (instance) => {
        assert(_.isObject(instance));
        assert.equal(instance.id, bridge.id);

        _.each(operations.bridges, (operation) => {
          assert(_.includes(_.keys(bridge), operation));
        });
      };

      return ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then((instance) => {
        validate(instance);

        return instance.create({
          bridgeId: instance.id,
          type: 'holding'
        });
      }).then((instance) => {
        validate(instance);
      });
    });

    it('should work with promisify', () => {
      const bridge = ari.Bridge('denodeify');

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});
      const validate = (instance) => {
        assert(_.isObject(instance));
        assert.equal(instance.id, bridge.id);

        _.each(operations.bridges, (operation) => {
          assert(_.includes(_.keys(bridge), operation));
        });
      };

      let create = Promise.promisify(ari.bridges.create, ari);

      return create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then((instance) => {
        validate(instance);

        create = Promise.promisify(instance.create, instance);

        return create({
          bridgeId: instance.id,
          type: 'holding'
        });
      }).then((instance) => {
        validate(instance);
      });
    });

    it('should not find resources that do not exist', (done) => {
      server
        .get('/ari/bridges/1')
        .any()
        .reply(404, {'message': 'Bridge not found'});

      ari.bridges.get({bridgeId: '1'}, (err, bridge) => {
        assert(bridge === undefined);
        assert(err.message.match('Bridge not found'));

        done();
      });
    });

    it('should not find resources that do not exist using promises', () => {
      server
        .get('/ari/bridges/1')
        .any()
        .reply(404, {'message': 'Bridge not found'});

      return ari.bridges.get({bridgeId: '1'}).catch((err) => {
        assert(err.message.match('Bridge not found'));
      });
    });

    it('should deal with a bad parameter', (done) => {
      server
        .post('/ari/bridges?type=holding')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'})
        .get('/ari/bridges')
        .any()
        .reply(200, [{'bridge_type': 'holding', id: '123443555.1'}])
        .get('/ari/bridges/123443555.1')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'});

      ari.bridges.create({type: 'holding'}, (err, instance) => {
        ari.bridges.list((err, bridges) => {
          ari.bridges.get({bogus: '', bridgeId: bridges[0].id}, (err, bridge) => {
            assert.equal(bridges[0].id, bridge.id);

            done();
          });
        });
      });
    });

    it('should deal with a bad parameter using promises', () => {
      server
        .post('/ari/bridges?type=holding')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'})
        .get('/ari/bridges')
        .any()
        .reply(200, [{'bridge_type': 'holding', id: '123443555.1'}])
        .get('/ari/bridges/123443555.1')
        .any()
        .reply(200, {'bridge_type': 'holding', id: '123443555.1'});

      return ari.bridges.create({type: 'holding'}).then((instance) => {
        return ari.bridges.list();
      })
      .then((bridges) => {
        return ari.bridges.get({
          bogus: '',
          bridgeId: bridges[0].id
        }).then((bridge) => {
          assert.equal(bridges[0].id, bridge.id);
        });
      });
    });

    it('should pass ids to operations when appropriate', (done) => {
      const bridge = ari.Bridge();
      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .get(`/ari/bridges/${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }, (err, bridge) => {
        bridge.get((err, instance) => {
          assert.equal(instance.id, bridge.id);

          done();
        });
      });
    });

    it('should pass ids to operations when appropriate using promises', () => {
      const bridge = ari.Bridge();
      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .get(`/ari/bridges/${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      return ari.bridges.create({
        bridgeId: bridge.id,
        type: 'holding'
      }).then((bridge) => {
        return bridge.get();
      })
      .then((instance) => {
        assert.equal(instance.id, bridge.id);
      });
    });
  });

  describe('#creators', () => {
    it('should generate unique ids', () => {
      const bridge = ari.Bridge();
      const bridge2 = ari.Bridge();
      const regex = /[a-z0-9]{8}(-[a-z0-9]{4}){3}-[a-z0-9]{12}/;

      assert.notEqual(bridge.id, bridge2);
      assert(bridge.id);
      assert(bridge2.id);
      assert(regex.exec(bridge.id));
      assert(regex.exec(bridge2.id));
    });

    it('should have all operations', () => {
      const bridge = ari.Bridge();

      _.each(operations.bridges, (operation) => {
        _.includes(_.keys(bridge), operation);
      });
    });

    it('should pass unique id when calling a create method', (done) => {
      const bridge = ari.Bridge();

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      bridge.create({type: 'holding'}, (err, instance) => {
        assert.equal(instance.id, bridge.id);

        done();
      });
    });

    it('should pass unique id when calling a create method using promises', () => {

      const bridge = ari.Bridge();

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id});

      return bridge.create({type: 'holding'}).then((instance) => {
        assert.equal(instance.id, bridge.id);
      });
    });

    it('should pass instance id when calling a create method', (done) => {
      const bridge = ari.Bridge();
      const recording = ari.LiveRecording();

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .post(
          `/ari/bridges/${bridge.id}/record?name=${recording.name}&format=wav&maxDurationSeconds=1`
        )
        .any()
        .reply(200, {format: 'wav', name: recording.name});

      bridge.create({type: 'holding'}, (err, bridgeInstance) => {
        const opts = {format: 'wav', maxDurationSeconds: '1'};
        bridge.record(opts, recording, (err, instance) => {
          assert(instance.name);
          assert.equal(instance.name, recording.name);

          done();
        });
      });
    });

    it('should pass instance id when calling a create method using promises', () => {
      const bridge = ari.Bridge();
      const recording = ari.LiveRecording();

      server
        .post(`/ari/bridges?type=holding&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'holding', id: bridge.id})
        .post(
          `/ari/bridges/${bridge.id}/record?name=${recording.name}&format=wav&maxDurationSeconds=1`
        )
        .any()
        .reply(200, {format: 'wav', name: recording.name});

      return bridge.create({type: 'holding'}).then((bridgeInstance) => {
        const opts = {format: 'wav', maxDurationSeconds: '1'};

        return bridge.record(opts, recording);
      }).then((instance) => {
        assert(instance.name);
        assert.equal(instance.name, recording.name);
      });
    });

    it('should not modify options passed in to operations', (done) => {
      const bridge = ari.Bridge();

      server
        .post(`/ari/bridges?type=mixing&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'mixing', id: bridge.id})
        .post(
          `/ari/applications/unittests/subscription?eventSource=bridge%3A${bridge.id}`
        )
        .any()
        .reply(200, {name: 'unittests', 'bridge_ids': [bridge.id]});

      bridge.create({type: 'mixing'}, (err, newBridge) => {
        const opts = {
          applicationName: 'unittests',
          eventSource: `bridge:${bridge.id}`,
        };

        ari.applications.subscribe(opts, (err, application) => {
          assert(application);
          assert.equal(application['bridge_ids'][0], bridge.id);
          assert.equal(opts.applicationName, 'unittests');
          assert.equal(opts.eventSource, `bridge:${bridge.id}`);

          done();
        });
      });
    });

    it('should not modify options passed in to operations using promises', () => {
      const bridge = ari.Bridge();

      server
        .post(`/ari/bridges?type=mixing&bridgeId=${bridge.id}`)
        .any()
        .reply(200, {'bridge_type': 'mixing', id: bridge.id})
        .post(
          `/ari/applications/unittests/subscription?eventSource=bridge%3A${bridge.id}`
        )
        .any()
        .reply(200, {name: 'unittests', 'bridge_ids': [bridge.id]});

      const opts = {
        applicationName: 'unittests',
        eventSource: `bridge:${bridge.id}`,
      };

      return bridge.create({type: 'mixing'}).then((newBridge) => {
        return ari.applications.subscribe(opts);
      }).then((application) => {
        assert(application);
        assert.equal(application['bridge_ids'][0], bridge.id);
        assert.equal(opts.applicationName, 'unittests');
        assert.equal(opts.eventSource, `bridge:${bridge.id}`);
      });
    });

    it('should allow passing in id on creation', () => {
      const recording = ari.LiveRecording('mine');
      const channel = ari.Channel('1234');

      assert.equal(recording.name, 'mine');
      assert.equal(channel.id, '1234');
    });

    it('should allow passing in values on creation', () => {
      const mailbox = ari.Mailbox({name: '1234', oldMessages: 0});

      assert.equal(mailbox.name, '1234');
      assert.equal(mailbox.oldMessages, 0);
    });

    it('should allow passing in id and values on creation', () => {
      const mailbox = ari.Mailbox('1234', {oldMessages: 0});

      assert.equal(mailbox.name, '1234');
      assert.equal(mailbox.oldMessages, 0);
    });

    it('should allow passing function variables to client or resource', (done) => {
      const channel = ari.Channel();
      const body = '{"variables":{"CALLERID(name)":"Alice"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          `/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=${channel.id}`,
          body
        )
        .any()
        .reply(200, {id: '1'});

      const options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CALLERID(name)': 'Alice'}
      };
      ari.channels.originate(options, (err, channel) => {
        if (!err) {
          channel.originate(options, (err, channel) => {
            if (!err) {
              done();
            }
          });
        }
      });
    });

    it('should allow passing function variables to client or resource using promises', () => {
      const channel = ari.Channel();
      const body = '{"variables":{"CALLERID(name)":"Bob"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          `/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=${channel.id}`,
          body
        )
        .any()
        .reply(200, {id: '1'});

      const options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CALLERID(name)': 'Bob'}
      };

      return ari.channels.originate(options).then((channel) => {
        return channel.originate(options);
      })
      .then((channel) => {
        assert(channel);
      });
    });

    it('should allow passing standard variables to client or resource', (done) => {
      const channel = ari.Channel();
      const body = '{"variables":{"CUSTOM":"myvar"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          `/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=${channel.id}`,
          body
        )
        .any()
        .reply(200, {id: '1'});

      const options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CUSTOM': 'myvar'}
      };
      ari.channels.originate(options, (err, channel) => {
        if (!err) {
          channel.originate(options, (err, channel) => {
            if (!err) {
              done();
            }
          });
        }
      });
    });

    it('should allow passing standard variables to client or resource using promises', () => {
      const channel = ari.Channel();
      const body = '{"variables":{"CUSTOM":"myothervar"}}';

      server
        .post(
          '/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests',
          body
        )
        .any()
        .reply(200, {id: '1'})
        .post(
          `/ari/channels?endpoint=PJSIP%2Fsoftphone&app=unittests&channelId=${channel.id}`,
          body
        )
        .any()
        .reply(200, {id: '1'});

      const options = {
        endpoint: 'PJSIP/softphone',
        app: 'unittests',
        variables: {'CUSTOM': 'myothervar'}
      };

      return ari.channels.originate(options).then((channel) => {
        return channel.originate(options);
      })
      .then(function (channel) {
        assert(channel);
      });
    });

  });
});
