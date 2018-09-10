/**
 *  This example shows how a call can be originated from a channel entering a
 *  Stasis application to an endpoint. The endpoint channel will then enter the
 *  Stasis application and the 2 channels will be placed into a mixing bridge.
 *
 *  @namespace originate-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(originate-example)
 *      same => n,Hangup()
 */

'use strict';

const client = require('ari-client');

const ENDPOINT = 'PJSIP/sipphone';

/**
 *  Originate the outgoing channel
 *
 *  @function originate
 *  @memberof originate-example
 *  @param {module:ari-client~Client} ari - an ARI client instance
 *  @param {module:resources~Channel} incoming - the incoming channel that
 *    will originate the call to the endpoint
 */
function originate(ari, incoming) {
  incoming.once('StasisEnd',
    /**
     *  If the incoming channel ends, hangup the outgoing channel.
     *
     *  @callback incomingStasisEndCallback
     *  @memberof originate-example
     *  @param {Object} event - the full event object
     *  @param {module:resources~Channel} channel -
     *    the incoming channel leaving Stasis
     */
    (event, channel) => {

      outgoing.hangup();
    });

  const outgoing = ari.Channel();

  outgoing.once('ChannelDestroyed',
    /**
     *  If the endpoint rejects the call, hangup the incoming channel.
     *
     *  @callback outgoingChannelDestroyedCallback
     *  @memberof originate-example
     *  @param {Object} event - the full event object
     *  @param {module:resources~Channel} channel -
     *    the channel that was destroyed
     */
    (event, channel) => {

      incoming.hangup();
    });

  outgoing.once('StasisStart',
    /**
     *  When the outgoing channel enters Stasis, create a mixing bridge
     *  and join the channels together.
     *
     *  @callback outgoingStasisStartCallback
     *  @memberof originate-example
     *  @param {Object} event - the full event object
     *  @param {module:resources~Channel} outgoing -
     *    the outgoing channel entering Stasis
     */
    (event, outgoing) => {

      const bridge = ari.Bridge();

      outgoing.once('StasisEnd',
        /**
         *  If the outgoing channel ends, clean up the bridge.
         *
         *  @callback outgoingStasisEndCallback
         *  @memberof originate-example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} channel -
         *    the outgoing channel leaving Stasis
         */
        (event, channel) => {

          bridge.destroy();
        });

      outgoing.answer()
        .then(() => {
          return bridge.create({type: 'mixing'});
        }).then((bridge) => {
        return bridge.addChannel({channel: [incoming.id, outgoing.id]});
      })
        .catch((err) => {});
    });

  const playback = ari.Playback();
  incoming.play({media: 'sound:vm-dialout'}, playback)
    .then(() => {
      // Originate call from incoming channel to endpoint
      return outgoing.originate({
        endpoint: ENDPOINT,
        app: 'originate-example',
        appArgs: 'dialed'
      });
    })
    .catch((err) => {});
}

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret')
  .then((ari) => {

    // Use once to start the application to ensure this listener will only run
    // for the incoming channel
    ari.once('StasisStart',
        /**
         *  Once the incoming channel has entered Stasis, answer it and
         *  originate call to the endpoint (outgoing channel).
         *
         *  @callback incomingStasisStartCallback
         *  @memberof originate-example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} incoming -
         *    the incoming channel entering Stasis
         */
        (event, incoming) => {

      incoming.answer()
        .then(() => {
          originate(ari, incoming);
        });
    });

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('originate-example');
  })
  .catch((err) => {
    // handle error
  });
