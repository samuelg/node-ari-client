/**
 *  This example shows how a channel entering a Stasis application can be added
 *  to a holding bridge and music on hold played on that channel.
 *
 *  @namespace bridge-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(bridge-example)
 *      same => n,Hangup()
 */

'use strict';

const client = require('ari-client');

/**
 *  Join holding bridge and play music on hold. If a holding bridge already
 *  exists, that bridge is used, otherwise a holding bridge is created.
 *
 *  @function getOrCreateBridge
 *  @memberof bridge-example
 *  @param {module:ari-client~Client} ari - an ARI client instance
 *  @param {module:resources~Channel} channel -
 *    the channel that entered Stasis
 *  @returns {Q} promise - a promise that will resolve to a bridge
 */
function getOrCreateBridge(ari, channel) {
  return ari.bridges.list()
    .then((bridges) => {
      let bridge = bridges.filter((candidate) => {
        return candidate['bridge_type'] === 'holding';
      })[0];

      if (!bridge) {
        bridge = ari.Bridge();

        return bridge.create({type: 'holding'});
      } else {
        // Add incoming channel to existing holding bridge and play
        // music on hold
        return bridge;
      }
    });
}

/**
 *  Join holding bridge and play music on hold. An event listener is also
 *  setup to handle cleaning up the bridge once all channels have left it.
 *
 *  @function joinHoldingBridgeAndPlayMoh
 *  @memberof bridge-example
 *  @param {module:resources~Bridge} bridge -
 *    the holding bridge to add the channel to
 *  @param {module:resources~Channel} channel -
 *    the channel that entered Stasis
 *  @returns {Q} promise - a promise that will resolve once the channel
 *                         has been added to the bridge and moh has been
 *                         started
 */
function joinHoldingBridgeAndPlayMoh(bridge, channel) {
  bridge.on('ChannelLeftBridge',
    /**
     *  If no channel remains in the bridge, destroy it.
     *
     *  @callback channelLeftBridgeCallback
     *  @memberof bridge-example
     *  @param {Object} event - the full event object
     *  @param {Object} instances - bridge and channel
     *    instances tied to this channel left bridge event
     */
    (event, instances) => {

      const holdingBridge = instances.bridge;
      if (holdingBridge.channels.length === 0 &&
        holdingBridge.id === bridge.id) {

        bridge.destroy()
          .catch((err) => {});
      }
    });

  return bridge.addChannel({channel: channel.id})
    .then(() => {
      return channel.startMoh();
    });
}

client.connect('http://ari.js:8088', 'user', 'secret')
  .then((ari) => {
    // use once to start the application
    ari.on('StasisStart',
        /**
         *  Answer incoming channel, join holding bridge, then play music on
         *  hold.
         *
         *  @callback stasisStartCallback
         *  @memberof bridge-example
         *  @param {Event} event - full event object
         *  @param {module:resources~Channel} channel -
         *    the channel that entered Stasis
         */
        (event, incoming) => {

      incoming.answer()
        .then(() => {
          return getOrCreateBridge(ari, incoming);
        })
        .then((bridge) => {
          return joinHoldingBridgeAndPlayMoh(bridge, incoming);
        })
        .catch((err) => {});
    });

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('bridge-example');
  })
  .catch((err) => {
    // handle error
  });
