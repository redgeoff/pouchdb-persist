/*jshint expr:true */
'use strict';

var Pouch = require('pouchdb');

var pouchPersist = require('../');
Pouch.plugin(pouchPersist);

var chai = require('chai');
chai.use(require("chai-as-promised"));

chai.should(); // var should = chai.should();
var Promise = require('bluebird');

// Binds to event, executes action, after action finished resolves when event emitted
// -->resolves({ action: actionArgs, event: eventArgs })
// function doAndOnce(actionFactory, event, emitter) {
//   var actionDefer = Promise.pending(), eventDefer = Promise.pending();
//   emitter.once(event, function () {
//     var eventArgs = arguments;
//     return actionDefer.promise.then(function (actionArgs) {
//       eventDefer.fulfill({ action: actionArgs, event: eventArgs });
//     });
//   });
//   return actionFactory().then(function () {
//     actionDefer.fulfill(arguments);
//     return eventDefer.promise;
//   });
// };

var dbName = 'test_db', db, remoteUrl, remoteDb;

beforeEach(function () {
  db = new Pouch(dbName);
  remoteUrl = 'http://localhost:5984/' + dbName;
  remoteDb = new Pouch(remoteUrl);
  return db;
});

function destroy() {
  return db.destroy().then(function () { // destroy local db
    return Pouch.destroy(remoteUrl); // destroy remote db
  });
}

afterEach(function () {
  return destroy();
});

describe('test suite', function () {

  this.timeout(10000); // increase timeout to simulate connections and disconnections

  function assertAllDocs(foo) {
    return remoteDb.allDocs({ include_docs: true }).then(function (docs) {
      docs.rows.length.should.equal(1);
      docs.rows[0].doc._id.should.equal('123');
      docs.rows[0].doc.foo.should.equal(foo);
    });
  }

  it('should persist', function () {
    // create doc, connect, check doc, disconnect, update doc, connect, check doc
    var id = '123';
    return new Promise(function (resolve) {
      return db.put({ _id: id, foo: 'bar' }).then(function (response) {
        var persist = db.persist({ url: remoteUrl });
        persist.once('connect', function () {
          assertAllDocs('bar').then(function () {
            persist.once('disconnect', function () {
              db.put({ _id: id, _rev: response.rev, foo: 'you' }).then(function () {
                persist.once('connect', function () {
                  assertAllDocs('you').then(resolve);
                });
                persist.start();
              });
            });
            persist.stop();
          });
        });
      });
    });
  });

  // TODO: override window.XMLHttpRequest so that it always returns an error to simulate
  // disconnection

  // TODO: make sure disconnect and connect only emitted once per disconnection and connection

});