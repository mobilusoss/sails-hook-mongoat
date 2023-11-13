/**
 * Created by Mike on 26/05/15.
 */
module.exports = function (sails) {
  // store created indexes
  var indexes = [],
    // see http://docs.mongodb.org/manual/reference/method/db.collection.createIndex/#options-for-all-index-types
    // UNUSED  - TODO check for valid options.
    validProperties = [
      "unique", // boolean
      "name", // string
      "expiresAfterSeconds", // integer
      "sparse", // boolean
      "background", // boolean
      // text index options
      "weights", // object
      "default_language", // string
      "language_override", // string
      "textIndexVersion", // integer
      // options for for 2dsphere Indexes,
      "2dsphereIndexVersion", // integer
      // options for 2d indexes
      "bits", // integer
      "min", // number
      "max", // number
      // options for geoHaystack Indexes
      "bucketSize", // number
    ];

  if (!_) var _ = require("lodash");

  if (!async) var async = require("async");

  var getIndexes = function (key, done) {
    var model = sails.models[key];
    // check for indexes
    if (_.isArray(model.indexes) && model.indexes.length > 0) {
      async.forEachOf(
        model.indexes,
        function (indexObject, i, done) {
          model.indexes[i].model = key; // add model name to index
          done();
        },
        function () {
          indexes = _.union(indexes, model.indexes);
          done();
        }
      );
    } else {
      done();
    }
  };

  return {
    createIndex: async function (modelName, fields, options, next) {
      var model = sails.models[modelName];
      // check model adapter is sails-mongo by checking first connections adapter -- is this the best way?
      if (model && _.isFunction(model.getDatastore)) {
        var db = model.getDatastore().manager;
        var collection = db.collection(modelName);
        if (_.isFunction(collection.createIndex)) {
          try {
            await collection.createIndex(fields, options);
            sails.log.verbose(
              "Mongoat: An index was created for model",
              modelName,
              fields,
              options
            );
          } catch (err) {
            sails.log.error(
              "Mongoat: Error creating index for model",
              modelName
            );
            sails.log.error(fields);
            sails.log.error(err);
          }
          if (_.isFunction(next)) {
            next(err);
          }
        } else {
          sails.log.error(
            "Mongoat: Native collection is not function",
            modelName
          );
          if (_.isFunction(next)) {
            next(err);
          }
        }
      } else if (model && _.isFunction(model.native)) {
        model.native(async function (err, collection) {
          if (err) {
            sails.log.error("Mongoat: Could not connect to MongoDB", modelName);
            if (_.isFunction(next)) {
              next(err);
            }
          } else {
            if (_.isFunction(collection.createIndex)) {
              try {
                await collection.createIndex(fields, options);
                sails.log.verbose(
                  "Mongoat: An index was created for model",
                  modelName,
                  fields,
                  options
                );
              } catch (err) {
                if (err.code === 85 || err.code === 86) {
                  sails.log.warn(
                    "Mongoat: Error creating index for model",
                    modelName
                  );
                  sails.log.warn(fields);
                  sails.log.warn(err);
                } else {
                  sails.log.error(
                    "Mongoat: Error creating index for model",
                    modelName
                  );
                  sails.log.error(fields);
                  sails.log.error(err);
                }
              }
              if (_.isFunction(next)) {
                next(err);
              }
            } else {
              sails.log.error(
                "Mongoat: Native collection is not function",
                modelName
              );
              if (_.isFunction(next)) {
                next(err);
              }
            }
          }
        });
      } else {
        if (_.isFunction(next))
          next(
            "Model not provided or model adapter is not provided native collection."
          );
      }
    },
    initialize: function (cb) {
      var self = this;
      var eventsToWaitFor = [];

      if (sails.hooks.orm) eventsToWaitFor.push("hook:orm:loaded");

      sails.after(eventsToWaitFor, function () {
        sails.log.verbose("sails mongoat started");

        if (
          sails.config.models.migrate !== "alter" &&
          sails.config.models.migrate !== "drop"
        ) {
          sails.log.verbose(
            'sails mongoat skipping index creation (according to "' +
              sails.config.models.migrate +
              '" migration strategy)'
          );
          return cb();
        }

        async.each(Object.keys(sails.models), getIndexes, function () {
          async.each(
            indexes,
            function (index, done) {
              self.createIndex(
                index.model,
                index.attributes,
                index.options || {},
                done
              );
            },
            function () {
              cb();
            }
          );
        });
      });
    },
  };
};
