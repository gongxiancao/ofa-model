var mongoose = require('mongoose'),
  _ = require('lodash'),
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

  var models = self.models = {};
  var modelsPath = self.config.paths.models = pathUtil.join(self.config.paths.root, 'api/models');

  var fileNames = fs.readdirSync(modelsPath);

  fileNames.forEach(function (fileName) {
    var filePath = pathUtil.join(modelsPath, fileName);
    var stat = fs.statSync(filePath);
    var extname = pathUtil.extname(filePath);
    if(stat && stat.isFile && extname === '.js') {
      var moduleName = pathUtil.basename(fileName, extname);
      models[moduleName] = require(filePath);
    }
  });

  _.each(Object.keys(models), function (modelName) {
    models[modelName] = mongoose.model(modelName, new Schema(models[modelName].attributes));
  });

  _.extend(global, models);

  var connectionString = composeMongodbConnectionString(connectionConfig);
  return mongoose.connect(connectionString, done);
};