"use strict";

var EventEmitter = require('./EventEmitter');

var __id__ = 0;

/**
  Simple ServerWebSocket implementation for local testing
*/

function ServerWebSocket(messageQueue, clientId) {
  ServerWebSocket.super.apply(this);
  this.messageQueue = messageQueue;
  this.clientId = clientId;

  this.__id__ = __id__++;
}

ServerWebSocket.Prototype = function() {
  /**
    Gets called by the message queue to handle a message
  */
  this._onMessage = function(data) {
    this.emit('message', data);
  };

  /**
    Gets called by the message queue to handle a message
  */
  this.send = function(data) {
    this.messageQueue.pushMessage({
      from: this.clientId,
      to: this.clientId.replace('-server', ''),
      data: data
    });
  };
};

EventEmitter.extend(ServerWebSocket);

module.exports = ServerWebSocket;