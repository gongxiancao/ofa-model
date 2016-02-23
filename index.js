var mongoose = require('mongoose'),
  _ = require('lodash'),
  async = require('async'),
  fs = require('fs'),
  pathUtil = require('path'),
  Schema = mongoose.Schema;

function composeMongodbConnectionString(config) {
  return 'mongodb://'+ (config.user ? (config.user + ':' + config.password + '@'): '') + config.host + ':' + (config.port || 27017) + '/' + config.database;
}

module.exports = function (done) {
  var self = this;
  var modelsConfig = self.config.models;
  var connectionName = modelsConfig.connection;
  var connectionConfig = self.config.connections[connectionName];
  if(!connectionConfig) {
    throw new Error('No connection config with name ' + connectionName + ' for current env');
  }

  global.ObjectId = Schema.Types.ObjectId;

  var models = self.models = {};
  var modelsPath = self.config.paths.models = pathUtil.join(self.config.paths.root, 'api/models');

  fs.readdir(modelsPath, function (err, fileNames) {
    async.each(fileNames, function (fileName, done) {
      var filePath = pathUtil.join(modelsPath, fileName);
      var extname = pathUtil.extname(filePath);
      if(extname !== '.js') {
        return done();
      }
      fs.stat(filePath, function (err, stat) {
        if(err) {
          return done();
        }

        if(stat.isFile()) {
          var moduleName = pathUtil.basename(fileName, extname);
          models[moduleName] = require(filePath);
        }
        done();
      });
    }, function () {
      _.each(Object.keys(models), function (modelName) {
        models[modelName] = mongoose.model(modelName, new Schema(models[modelName].attributes, {collection: modelName.toLowerCase()}));
      });

      _.extend(global, models);

      var connectionString = composeMongodbConnectionString(connectionConfig);
      mongoose.connect(connectionString, done);
    });
  });
};
