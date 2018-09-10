/**
 *  This example shows how mailbox counts (new/old messages) can be updated
 *  based on live recordings being recorded or played back.
 *
 *  @namespace mwi-example
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 *  @example <caption>Dialplan</caption>
 *  exten => 7000,1,NoOp()
 *      same => n,Stasis(mwi-example)
 *      same => n,Hangup()
 */

'use strict';

const client = require('ari-client');
const Promise = require('bluebird');

/**
 *  Initiate a playback on the given channel.
 *
 *  @function play
 *  @memberof example
 *  @param {module:ari-client~Client} ari - an ARI client instance
 *  @param {module:resources~Channel} channel - the channel to send the
 *    playback to
 *  @param {string} sound - the string identifier of the sound to play
 *  @returns {Q} promise - a promise that will resolve to the finished
 *                         playback
 */
function play(ari, channel, sound) {
  const playback = ari.Playback();

  return new Promise((resolve, reject) => {
    playback.once('PlaybackFinished',
      /**
       *  Once playback telling user how to leave a message has
       *  finished, play message telling user how to play the
       *  next available message.
       *
       *  @callback leaveMessageCallback
       *  @memberof mwi-example
       *  @param {Error} err - error object if any, null otherwise
       *  @param {module:resources~Playback} newPlayback -
       *    the playback object once it has finished
       */
      (event, playback) => {

        resolve(playback);
      });

    channel.play({media: sound}, playback)
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 *  Initiate a recording on the given channel.
 *
 *  @function record
 *  @memberof example
 *  @param {module:ari-client~Client} ari - an ARI client instance
 *  @param {module:resources~Channel} channel - the channel to record
 *  @param {object} opts - options to be passed to the record function
 *  @returns {Q} promise - a promise that will resolve to the finished
 *                         recording
 */
function record(ari, channel, opts) {
  const recording = ari.LiveRecording();

  return new Promise((resolve, reject) => {
    recording.once('RecordingFinished',
      /**
       *  Once the message has been recorded, play an announcement
       *  that the message has been saved and update the mailbox
       *  to show the new message count.
       *
       *  @callback recordingFinishedCallback
       *  @memberof mwi-example
       *  @param {Object} event - the full event object
       *  @param {module:resources~LiveRecording} newRecording -
       *    the recording object after creation
       */
      (event, recording) => {

        resolve(recording);
      });

    channel.record(opts, recording)
      .catch((err) => {
        reject(err);
      });
  });
}

// replace ari.js with your Asterisk instance
client.connect('http://ari.js:8088', 'user', 'secret')
  .then((ari) => {

    // Create new mailbox
    const mailbox = ari.Mailbox('mwi-example');
    let messages = 0;

    ari.on('StasisStart',
        /**
         *  Setup event listeners for dtmf events, answer channel that entered
         *  Stasis and play greeting telling user to either leave a message or
         *  play the next available message.
         *
         *  @callback stasisStartCallback
         *  @memberof mwi-example
         *  @param {Object} event - the full event object
         *  @param {module:resources~Channel} channel -
         *    the channel that entered Stasis
         */
        (event, channel) => {

      channel.on('ChannelDtmfReceived',
          /**
           *  Handle dtmf events. 5 records a message and 6 plays the last
           *  available message.
           *
           *  @callback channelDtmfReceivedCallback
           *  @memberof mwi-example
           *  @param {Object} event - the full event object
           *  @param {module:resources~Channel} channel - the channel that
           *    received the dtmf event
           */
           (event, channel) => {

        const digit = event.digit;
        switch (digit) {
          case '5':
            // Record message
            const opts = {
              format: 'wav',
              maxSilenceSeconds: '2',
              beep: true
            };

            record(ari, channel, opts)
              .then(() => {
                return play(ari, channel, 'sound:vm-msgsaved');
              })
              .then(() => {
                // Update MWI
                messages += 1;
                const opts = {
                  oldMessages: 0,
                  newMessages: messages
                };

                return mailbox.update(opts);
              })
              .then(() => {
                return channel.hangup();
              })
              .catch((err) => {});
            break;
          case '6':
            // Playback last message
            ari.recordings.listStored()
              .then((recordings) => {
                const recording = recordings[recordings.length - 1];

                if (!recording) {
                  return play(ari, channel, 'sound:vm-nomore');
                } else {
                  // Play the latest message
                  const sound = `recording:${recording.name}}`;

                  return play(ari, channel, sound)
                    .then(() => {
                      return recording.deleteStored();
                    })
                    .then(() => {
                      // Remove MWI
                      messages -= 1;
                      const opts = {
                        oldMessages: 0,
                        newMessages: messages
                      };

                      return mailbox.update(opts);
                    })
                    .then(() => {
                      return play(ari, channel, 'sound:vm-next');
                    });
                }
              })
              .catch((err) => {});
            break;
        }
      });

      channel.answer()
        .then(() => {
          return play(ari, channel, 'sound:vm-leavemsg')
            .then(() => {
              return play(ari, channel, 'sound:vm-next');
            });
        })
        .catch((err) => {});
    });

    // can also use ari.start(['app-name'...]) to start multiple applications
    ari.start('mwi-example');
  })
  .catch((err) => {
    // handle error
  });
