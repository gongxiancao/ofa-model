
var mongoose = require('mongoose'),
  _ = require('lodash'),
  fs = require('fs'),
  mongodbUri = require('mongodb-uri'),
  pathUtil = require('path'),
  Promise = require('bluebird'),
  Schema = mongoose.Schema;

function composeMongodbConnectionString (config) {
  return mongodbUri.format(config);
}

function lift (done) {
  var self = this;
  var modelsConfig = self.config.models;
  var defaultConnectionName = modelsConfig.connection;

  // custom Promise
  if(modelsConfig.Promise) {
    mongoose.Promise = modelsConfig.Promise;
  }

  // expose mongoose schema types
  global.ObjectId = Schema.Types.ObjectId;
  global.Mixed = Schema.Types.Mixed;
  global.ObjectID = mongoose.mongo.ObjectID;

  var modelsPath = self.config.paths.models = pathUtil.join(self.config.paths.root, 'api/models');

  var readdirAsync = Promise.promisify(fs.readdir),
    statAsync = Promise.promisify(fs.stat);

  readdirAsync(modelsPath)
    .then(function (fileNames) {
      var filePaths = _.map(fileNames, function (fileName) {
        return pathUtil.join(modelsPath, fileName);
      });

      return [fileNames, filePaths, Promise.map(filePaths, function (filePath) {
        var extname = pathUtil.extname(filePath);
        if(extname !== '.js') {
          return null;
        }
        return statAsync(filePath);
      })];
    })
    .spread(function (fileNames, filePaths, fileStats) {
      var connections = {};
      var models = {};
      // get model definitions and connection definitions
      _.each(fileNames, function (fileName, index) {
        var stat = fileStats[index];
        if(!stat || !stat.isFile()) {
          return;
        }

        var filePath = filePaths[index];
        var model = require(filePath);
        var modelName = pathUtil.basename(fileName, '.js');

        models[modelName] = model;
        model.options = model.options || {};

        // cache connection config
        var connectionName = model.options.connection = model.options.connection || defaultConnectionName;
        var connectionConfig = self.config.connections[connectionName];
        if(!connectionConfig) {
          throw new Error('cannot find connection config for ' + connectionName);
        }
        connections[connectionName] = connectionConfig;
      });

      // specify native query promise type
      var connectionOptions = {
        config: {
          autoIndex: (typeof modelsConfig.autoIndex) === 'undefined' ? true: !!modelsConfig.autoIndex
        }
      };
      if(modelsConfig.Promise) {
        connectionOptions.promiseLibrary = modelsConfig.Promise;
      }

      // create used connections
      connections = _.mapValues(connections, function (connectionConfig) {
        return mongoose.createConnection(composeMongodbConnectionString(connectionConfig), connectionOptions);
      });

      self.models = models = _.mapValues(models, function (model, modelName) {
        model.options.collection = model.options.collection || modelName.toLowerCase();

        var options = _.extend({}, model.options);
        delete options.connection;

        var schema = new Schema(model.attributes, options);
        if(model.schemaInitializer) {
          model.schemaInitializer(schema);
        }
        var connectionName = model.options.connection || defaultConnectionName;
        return connections[connectionName].model(modelName, schema);
      });
      _.extend(global, self.models);
      return null;
    })
    .then(_.ary(done, 0))
    .catch(done);
}

function lower (done) {
  mongoose.disconnect(done);
}

module.exports = {
  lift: lift,
  lower: lower
};
