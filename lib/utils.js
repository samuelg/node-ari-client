/**
 *  Utility functions for ari-client.
 *
 *  @module utils
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

const _ = require('lodash');

/**
 *  Modifies options to swagger as body params as appropriate using the given
 *  defined operation parameters.
 *
 *  @memberof module:utils
 *  @method parseBodyParams
 *  @param {Object[]} params - defined operation parameters
 *  @param {Object} swaggerOptions - options that will be sent to a swagger
 *    operation
 *  @returns {Object} modified options
 */
function parseBodyParams(params, swaggerOptions) {
  const options = _.clone(swaggerOptions);
  const bodyParams = params.filter((param) => param.paramType === 'body');

  bodyParams.forEach((bodyParam) => {
    let jsonBody = options[bodyParam.name];
    if (jsonBody) {
      // variables behaves differently in that it expects a variables key to
      // wrap the key/value pairs
      if (bodyParam.name === 'variables' && !options.variables.variables) {
        jsonBody = { variables: jsonBody };
      } else if (bodyParam.name === 'fields' && !options.fields.fields) {
        jsonBody = { fields: jsonBody };
      }
      options.body = JSON.stringify(jsonBody);
      delete options[bodyParam.name];
    }
  });

  return options;
}

module.exports.parseBodyParams = parseBodyParams;
