/**
 *  This example shows how a playback can be controlled on a channel using
 *  channel dtmf events.
 *
 *  @namespace playback-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(playback-example)
 *      same => n,Hangup()
 */

'use strict';

const client = require('ari-client');

/**
 *  Register playback dtmf events to control playback.
 *
 *  @function registerDtmfListeners
 *  @memberof playback-example
 *  @param {module:resources~Playback} playback - the playback object to
 *    control
 *  @param {module:resources~Channel} incoming - the incoming channel
 *    responsible for playing and controlling the playback sound
 */
function registerDtmfListeners(playback, incoming) {
  incoming.on('ChannelDtmfReceived',
    /**
     *  Handle DTMF events to control playback. 5 pauses the playback, 8
     *  unpauses the playback, 4 moves the playback backwards, 6 moves the
     *  playback forwards, 2 restarts the playback, and # stops the
     *  playback and hangups the channel.
     *
     *  @callback channelDtmfReceivedCallback
     *  @memberof playback-example
     *  @param {Object} event - the full event object
     *  @param {module:resources~Channel} channel - the channel on which
     *    the dtmf event occured
     */
    (event, channel) => {

      const digit = event.digit;

      switch (digit) {
        case '5':
          playback.control({operation: 'pause'})
            .catch((err) => {});
          break;
        case '8':
          playback.control({operation: 'unpause'})
            .catch((err) => {});
          break;
        case '4':
          playback.control({operation: 'reverse'})
            .catch((err) => {});
          break;
        case '6':
          playback.control({operation: 'forward'})
            .catch((err) => {});
          break;
        case '2':
          playback.control({operation: 'restart'})
            .catch((err) => {});
          break;
        case '#':
          playback.control({operation: 'stop'})
            .catch((err) => {});
          incoming.hangup()
            .finally(() => {
              process.exit(0);
            });
          break;
        default:
          console.error(`Unknown DTMF ${digit}`);
      }
    });
}

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret')
  .then((ari) => {

    // Use once to start the application
    ari.once('StasisStart',
        /**
         *  Once the incoming channel has entered Stasis, answer it, play demo
         *  sound and register dtmf event listeners to control the playback.
         *
         *  @callback stasisStartCallback
         *  @memberof playback-example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} incoming - the channel entering
         *    Stasis
         */
        (event, incoming) => {

      incoming.answer()
        .then(() => {
          const playback = ari.Playback();

          // Play demo greeting and register dtmf event listeners
          return incoming.play(
            {media: 'sound:demo-congrats'},
            playback
          );
        })
        .then((playback) => {
          registerDtmfListeners(playback, incoming);
        })
        .catch((err) => {});
    });

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('playback-example');
  })
  .catch((err) => {
    // handle error
  });
