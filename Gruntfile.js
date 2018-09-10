/**
 *  Grunt tasks to support running linter, unit tests, and generating
 *  documentation.
 *
 *  @module GruntFile
 *
 *  @copyright 2014, Digium, Inc.
 *  @license Apache License, Version 2.0
 *  @author Samuel Fortier-Galarneau <sgalarneau@digium.com>
 */

'use strict';

const mustache = require('mustache');
const swagger = require('swagger-client');
const url = require('url');
const fs = require('fs');
const _ = require('lodash');
const request = require('request');
const async = require('async');
const { oneLineTrim } = require('common-tags');
const resourcesLib = require('./lib/resources.js');

module.exports = function(grunt) {

  // will contain metadata about ARI APIs after connection is established
  let swaggerClient;

  // Swagger success callback
  function swaggerLoaded (done) {
    if(swaggerClient.ready === true) {
      grunt.log.writeln('generating operations documentation');

      const apis = _.sortBy(_.keys(swaggerClient.apis));
      const operations =_.reduce(apis, generateOperations, '');

      grunt.log.writeln('generating events documentation');

      const models = _.sortBy(_.keys(swaggerClient.apis.events.models));
      const events = _.reduce(models, generateEvents, '');

      const template = fs.readFileSync('./dev/README.mustache', 'utf-8');
      const output = mustache.render(template, {
        operations: operations,
        events: events
      });
      fs.writeFileSync('./README.md', output, 'utf-8');

      done();
    }
  }

  // Swagger failure callback
  function swaggerFailed (err, done) {
    grunt.log.error(err);
    done(false);
  }

  // Generate all operations
  function generateOperations (existingOperations, resource) {
    if (resource !== 'events') {
      existingOperations += `#### ${resource}\n\n`;
      const api = swaggerClient.apis[resource];
      const ops = _.sortBy(_.keys(api.operations));

      _.each(ops, (name) => {
        const operation = api.operations[name];
        let results = '';
        if (operation.type !== null) {
          let returnType = operation.type;
          const regexArr =
            resourcesLib.swaggerListTypeRegex.exec(returnType);

          if (regexArr !== null) {
            returnType = `${regexArr[1]}s`;
          }
          returnType = returnType.toLowerCase();

          results += `, ${returnType}`;
        }
        let params = '';
        let paramsPromises = '';
        const requiredParams = [];
        const availableParams = [];
        const parameters = _.sortBy(operation.parameters, 'name');
        _.each(parameters, (param) => {
          if (param.required) {
            requiredParams.push(`${param.name}: val`);
          }

          availableParams.push(`- ${param.name} (${param.type}) - ${param.description}`);
        });
        if (requiredParams.length > 0) {
          params = `{${requiredParams.join(', ')}}`;
          params += ',\n  ';

          paramsPromises = `{\n    ${requiredParams.join(',\n    ')}\n}`;
        }

        const operationTemplate = fs.readFileSync(
          './dev/operation.mustache',
          'utf-8'
        );

        existingOperations += mustache.render(operationTemplate, {
          name: name,
          desc: operation.summary,
          resource: operation.resourceName,
          params: params,
          paramsPromises: paramsPromises,
          results: results,
          resultsPromises: results.substring(2)
        });

        if (availableParams.length > 0) {
          existingOperations += `###### Available Parameters\n${availableParams.join('\n')}\n\n`;
        }
      });
    }

    return existingOperations;
  }

  // Generate all events
  function generateEvents (existingEvents, name) {
    if (name !== 'Event' && name !== 'Message') {
      const event = swaggerClient.apis.events.models[name];
      let results = '';
      const props = _.sortBy(event.properties, 'name');

      const availableProps = [];
      const promoted = [];
      const instances = [];
      _.each(props, (prop) => {
        let propType = prop.dataType;
        const regexArr =
          resourcesLib.swaggerListTypeRegex.exec(propType);

        if (regexArr !== null) {
          propType = `${regexArr[1]}`;
        }

        if (_.includes(resourcesLib.knownTypes, propType)) {
          promoted.push(prop.name);
          if (!_.includes(instances, propType)) {
            instances.push(propType);
          }
        }

        availableProps.push(`- ${prop.name} (${prop.dataType}) - ${prop.descr}`);
      });

      if (promoted.length > 1) {
        results += `, {${promoted.join(': val, ')}: val}`;
      } else if (promoted.length === 1) {
        results += `, ${promoted[0]}`;
      }

      const eventTemplate = fs.readFileSync(
        './dev/event.mustache',
        'utf-8'
      );

      existingEvents += mustache.render(eventTemplate, {
        name: name,
        desc: swaggerClient.apis.events.rawModels[name].description,
        results: results
      });

      if (availableProps.length > 0) {
        existingEvents += `###### Available Event Properties\n${availableProps.join('\n')}\n\n`;
      }

      if (instances.length > 0) {
        existingEvents += `###### Resource Specific Emitters\n${instances.join('\n')}\n\n`;
      }
    }

    return existingEvents;
  }

  // loads a given fixture from an ARI definition json file
  function loadFixtureJson (fixtureName, options, done) {
    grunt.log.writeln(`generating fixture for ${fixtureName}`);

    const url = oneLineTrim`
      ${options.baseUrl}/ari/api-docs/
      ${fixtureName}.json?api_key=
      ${options.username}:${options.password}
    `;
    request(url, (err, resp, body) => {
      const filename = `${__dirname}/test/fixtures/${fixtureName}.json`;
      const content = body.replace(/ari\.js/g, 'localhost');
      fs.writeFileSync(filename, content);

      done();
    });
  }

  // Project configuration.
  grunt.initConfig({
    gendocs: {
      options: {
        baseUrl: 'http://ari.js:8088',
        username: 'user',
        password: 'secret'
      }
    },

    genfixtures: {
      options: {
        baseUrl: 'http://ari.js:8088',
        username: 'user',
        password: 'secret'
      }
    },

    jsdoc : {
      dist : {
        src: [
          'lib/*.js',
          'examples/*.js',
          'test/*.js',
          'Gruntfile.js',
          'README.md'
        ],
        options: {
          destination: 'doc'
        }
      }
    }
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-jsdoc');

  // Default task.
  grunt.registerTask('default', ['gendocs']);

  grunt.registerTask(
      'gendocs',
      'Generate operations and events documentation.',
      function () {

    const done = this.async();
    const options = this.options({});

    const parsedUrl = url.parse(options.baseUrl);
    swagger.authorizations.add(
      'basic-auth',
      new swagger.PasswordAuthorization(
        parsedUrl.hostname,
        options.username,
        options.password
      )
    );

    // Connect to API using swagger and attach resources on Client instance
    const resourcesUrl = `${parsedUrl.protocol}//${parsedUrl.host}/ari/api-docs/resources.json`;
    swaggerClient = new swagger.SwaggerApi({
      url: resourcesUrl,
      success() {
        swaggerLoaded(done);
      },
      failure() {
        swaggerFailed(done);
      },
    });
  });

  grunt.registerTask(
      'genfixtures',
      'Generate fixtures from ARI for unit tests.',
      function() {

    const taskDone = this.async();
    const options = this.options({});

    const fixtures = [
      'resources',
      'sounds',
      'recordings',
      'playbacks',
      'mailboxes',
      'events',
      'endpoints',
      'deviceStates',
      'channels',
      'bridges',
      'asterisk',
      'applications',
    ];

    // generate all fixtures in parallel
    async.each(fixtures, (fixture, done) => {
      loadFixtureJson(fixture, options, done);
    }, taskDone);
  });
};
