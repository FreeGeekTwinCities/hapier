var Hapi = require('hapi')
  , xmlrpc = require('xmlrpc')
  , ini = require('ini')
  , fs = require('fs')

var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
console.log(config);

var database = config.database.database;
var username = config.database.user;
var password = config.database.password;
var uid = false;

var client_common = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/common'});
client_common.methodCall('login', [database, username, password], function (error, value) {
    console.log(error + value);
    uid = value;
});

var client = xmlrpc.createClient({ host: 'localhost', port: 8069, path: '/xmlrpc/object'});

//
// The `createServer` factory method accepts the host name and port as the first
//    two parameters.
// When hosting on a PaaS provider, the host must be configured to allow all
//    connections (using 0.0.0.0) and the PORT environment variable must be
//    converted to a Number.
//
var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000, {'cors': true});


server.pack.require({ lout: { endpoint: '/docs' } }, function (err) {

    if (err) {
        console.log('Failed loading plugins');
    }
});

//
// Simulate an external module which is the correct way to expose this
//    kind of functionality.
//
var employeeController = {};

employeeController.getConfig = {
  handler: function(req) {
    client.methodCall('execute', [database, 1, password, 'hr.employee', 'search', []], function (error, employeeIDs) {
        // Results of the method response
        console.log(error);
        fields = ['name', 'id', 'state', 'image_small'];
        client.methodCall('execute', [database, 1, password, 'hr.employee', 'read', employeeIDs, fields], function (error, data) {console.log(data); req.reply(data);});
    });
  }
};

//
// Route configuration.
// ---
//

var routes = [
    { path: '/employee', method: 'GET', config: employeeController.getConfig }
];

server.addRoutes(routes);

server.start();
