var Hapi = require('hapi');
var util = require('util');
var Readable = require('stream').Readable;
var Wreck = require('wreck');

var internals = {};

internals.sendDataInterval = 10;             // Send data over the network to the socket "keep alive"
internals.timeUntilAllDataIsSent = 1000;     // Time until it will finish transmitting data
internals.socketTimeout = 100;               // Time until the socket will timeout, undefined for default
internals.payloadTimeout = false;            // Time until the payload will timeout, undefined for default

internals.DelayedStream = function(options){
    Readable.call(this, options);
    this.isOpen = true;
    this.started = false;

    // Write some data to stream every x ms. 0 = off.
    this.sendDataInterval       = options.interval || 0;
    // Close stream after x ms.
    this.timeUntilAllDataIsSent = options.duration || 1000;
};
util.inherits(internals.DelayedStream, Readable);
internals.DelayedStream.prototype._read = function(){
    var self = this;
    var interval = null;

    if (!self.started) {
        self.started = true;
        if (self.sendDataInterval > 0) {
            interval = setInterval(function () {
                if (self.isOpen) {
                    self.push('a'); // send some data
                }
            }, self.sendDataInterval);
        }
        setTimeout(function(){
            if (interval) { clearInterval(interval); }
            self.isOpen = false;
            self.push(null); // Close the stream, finished transmitting data.
        }, self.timeUntilAllDataIsSent);
    }
};

var server = new Hapi.Server();
server.connection();

server.route({
    method: 'post',
    path: '/upload',
    config: {
        payload: {
            output: 'stream',
            maxBytes: 1000000,
            parse: false,
            timeout: internals.payloadTimeout // Do not timeout while receiving payload
        },
        timeout: {
            socket: internals.socketTimeout   // Socket timeout is 1 sec
        },
        handler: function(request, reply){
            request.raw.req.on('data', function(d){
                // console.log(d.toString()); // Made sure that data is actually being transmitted over the socket
            });
            request.raw.req.on('end', function(){
                // console.log('Finished receiving data');
                return reply();
            });
        }
    }
});

server.start(function(err){
    if (err){
        return console.error(err);
    }

    var delayedStream = new internals.DelayedStream({ duration: internals.timeUntilAllDataIsSent, interval: internals.sendDataInterval });

    Wreck.post(server.info.uri + '/upload', { payload: delayedStream}, function (err, res, pay) {
        if (err) {
            return console.error(err);
        }
        console.log('Passed the test');
    });
});